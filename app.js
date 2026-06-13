const SUPABASE_URL = 'https://joszmqohhceuxhsjxxcr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impvc3ptcW9oaGNldXhoc2p4eGNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyODEwNjEsImV4cCI6MjA5Njg1NzA2MX0.sSPFSYVtNGbgelrcQNK2mS-1KCk13A5ROid7E0YewIg';
const PIN_CORRETO = '1927';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const ALUNOS_BASE = [];

let todosAlunos = [...ALUNOS_BASE];
let alunoAtual = null;
let presencasCache = {};
let autenticado = false;

function verificarPin() {
  const pin = document.getElementById('pin-input').value;
  if (pin === PIN_CORRETO) {
    autenticado = true;
    document.getElementById('pin-screen').style.display = 'none';
    document.getElementById('app-content').style.display = 'block';
    carregarTodosAlunos();
  } else {
    toast('PIN incorreto', true);
    document.getElementById('pin-input').value = '';
  }
}

async function carregarTodosAlunos() {
  setStatus('Sincronizando...');
  // Carregar alunos do banco
  let pagina = 0;
  const tamanho = 1000;
  while (true) {
    const { data: lote } = await sb.from('alunos').select('contrato, nome, ano').range(pagina * tamanho, (pagina + 1) * tamanho - 1);
    if (!lote || !lote.length) break;
    lote.forEach(a => { if (!todosAlunos.find(x => x.contrato === a.contrato)) todosAlunos.push(a); });
    if (lote.length < tamanho) break;
    pagina++;
  }
  // Presenças carregadas sob demanda ao abrir cada aluno
  setStatus('');
}

function setStatus(msg) {
  const el = document.getElementById('status-bar');
  el.innerHTML = msg ? `${msg}<span class="saving-dot"></span>` : '';
}

function normalizar(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function filtrar() {
  const q = normalizar(document.getElementById('search-input').value.trim());
  const el = document.getElementById('results');
  if (!q || q.length < 2) { el.innerHTML = '<div class="empty">Digite para buscar</div>'; return; }
  const found = todosAlunos.filter(a => normalizar(a.nome).includes(q) || a.contrato.includes(q)).slice(0, 15);
  if (!found.length) { el.innerHTML = '<div class="empty">Nenhum aluno encontrado</div>'; return; }
  el.innerHTML = found.map(a => `
    <div class="result-item" onclick="abrirAluno('${a.contrato}')">
      <div><div class="result-nome">${a.nome}</div><div class="result-contrato">Contrato ${a.contrato}</div></div>
      <span class="result-arrow">›</span>
    </div>`).join('');
}

async function abrirAluno(contrato) {
  alunoAtual = todosAlunos.find(a => a.contrato === contrato);
  if (!alunoAtual) return;
  document.getElementById('busca-lista').style.display = 'none';
  document.getElementById('busca-detalhe').style.display = 'block';
  // Limpar cache do aluno e buscar do banco
  presencasCache[contrato] = {};
  document.getElementById('detalhe-card').innerHTML = '<div class="loading">Carregando...</div>';
  const { data } = await sb.from('presencas')
    .select('contrato, modulo, aula, status, atualizado_em, criado_em')
    .eq('contrato', contrato);
  if (data) {
    data.forEach(r => {
      if (!presencasCache[r.contrato]) presencasCache[r.contrato] = {};
      if (!presencasCache[r.contrato][r.modulo]) presencasCache[r.contrato][r.modulo] = {};
      presencasCache[r.contrato][r.modulo][r.aula] = { status: r.status, dt: r.atualizado_em || r.criado_em };
    });
  }
  renderDetalhe();
}

function voltarLista() {
  alunoAtual = null;
  document.getElementById('busca-lista').style.display = 'block';
  document.getElementById('busca-detalhe').style.display = 'none';
}

function getStatus(contrato, modulo, aula) {
  const r = presencasCache[contrato] && presencasCache[contrato][modulo] && presencasCache[contrato][modulo][aula];
  return r ? r.status : '';
}

function getDtAula(contrato, modulo, aula) {
  const r = presencasCache[contrato] && presencasCache[contrato][modulo] && presencasCache[contrato][modulo][aula];
  if (!r || !r.dt) return '';
  const d = new Date(r.dt);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
}

async function ciclar(contrato, modulo, aula) {
  const atual = getStatus(contrato, modulo, aula);
  const proximo = atual === '' ? 'C' : atual === 'C' ? 'F' : '';
  if (!presencasCache[contrato]) presencasCache[contrato] = {};
  if (!presencasCache[contrato][modulo]) presencasCache[contrato][modulo] = {};
  if (proximo === '') {
    delete presencasCache[contrato][modulo][aula];
  } else {
    presencasCache[contrato][modulo][aula] = { status: proximo, dt: new Date().toISOString() };
  }
  renderDetalhe();
  setStatus('Salvando');
  if (proximo === '') {
    await sb.from('presencas').delete().eq('contrato', contrato).eq('modulo', modulo).eq('aula', aula);
  } else {
    await sb.from('presencas').upsert({ contrato, modulo, aula, status: proximo, nome: alunoAtual.nome }, { onConflict: 'contrato,modulo,aula' });
  }
  setStatus('');
}

function renderAulas(contrato, modulo, label) {
  let html = `<div class="modulo-label">${label}</div><div class="aulas-row">`;
  for (let i = 1; i <= 4; i++) {
    const key = `${contrato}_${modulo}_P${i}`;
    const s = getStatus(contrato, modulo, 'P' + i);
    const dt = getDtAula(contrato, modulo, 'P' + i);
    const cls = s === 'C' ? 'presente' : s === 'F' ? 'falta' : '';
    const val = s || '—';
    const dtHtml = dt ? `<div class="aula-dt">${dt}</div>` : '';
    html += `<div class="aula-btn ${cls}" onclick="ciclar('${contrato}','${modulo}','P${i}')">
      <div class="aula-num">Aula ${i}</div>
      <div class="aula-val">${val}</div>
      ${dtHtml}
    </div>`;
  }
  html += `</div>`;
  return html;
}

function renderDetalhe() {
  const c = alunoAtual.contrato;
  document.getElementById('detalhe-card').innerHTML = `
    <div class="card-nome">${alunoAtual.nome}</div>
    <div class="card-contrato">Contrato ${c}</div>
    ${renderAulas(c, 'PIEP', 'PIEP — 4 aulas')}
    ${renderAulas(c, 'EMP', 'Empregabilidade — 4 aulas')}
    <div class="hint">Toque para alternar: — → C (presente) → F (falta) → —</div>`;
}

async function salvarNovoAluno() {
  const nome = document.getElementById('novo-nome').value.trim();
  const contrato = document.getElementById('novo-contrato').value.trim();
  if (!nome || !contrato) { toast('Preencha nome e contrato', true); return; }
  if (todosAlunos.find(a => a.contrato === contrato)) { toast('Contrato já cadastrado', true); return; }
  const btn = document.getElementById('btn-salvar-novo');
  btn.disabled = true;
  setStatus('Salvando');
  const { error } = await sb.from('alunos').insert({ contrato, nome, ano: '2026' });
  btn.disabled = false;
  setStatus('');
  if (error) { toast('Erro ao salvar', true); return; }
  todosAlunos.push({ contrato, nome });
  document.getElementById('novo-nome').value = '';
  document.getElementById('novo-contrato').value = '';
  toast(`${nome} cadastrado com sucesso`);
}

function setTab(tab) {
  document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', ['busca','novo','historico','auditoria'][i] === tab));
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('sec-' + tab).classList.add('active');
  if (tab === 'historico') carregarHistorico();
  if (tab === 'auditoria') carregarAuditoria();
}

async function carregarHistorico() {
  const el = document.getElementById('historico-card');
  el.innerHTML = '<div class="loading">Carregando...</div>';
  const { data } = await sb.from('presencas').select('*').order('criado_em', { ascending: false }).limit(50);
  if (!data || !data.length) { el.innerHTML = '<div class="empty">Nenhum lançamento ainda.</div>'; return; }
  el.innerHTML = data.map(r => {
    const dt = new Date(r.criado_em).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    return `<div class="hist-item">
      <div class="hist-nome">${r.nome}</div>
      <div class="hist-det">
        ${r.modulo.startsWith('PIEP') ? 'PIEP' : 'Empregabilidade'} · Aula ${r.aula.replace('P','')} ·
        <span class="badge ${r.status === 'C' ? 'badge-c' : 'badge-f'}">${r.status === 'C' ? 'Presente' : 'Falta'}</span>
        · ${dt}
      </div>
    </div>`;
  }).join('');
}

async function carregarAuditoria() {
  const el = document.getElementById('auditoria-card');
  el.innerHTML = '<div class="loading">Carregando...</div>';
  const { data } = await sb.from('auditoria').select('*').order('momento', { ascending: false }).limit(100);
  if (!data || !data.length) { el.innerHTML = '<div class="empty">Nenhuma alteração registrada.</div>'; return; }
  el.innerHTML = '<div style="font-size:13px;font-weight:600;margin-bottom:12px;color:var(--text2)">Últimas 100 alterações</div>' +
    data.map(r => {
      const dt = new Date(r.momento).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
      const de = r.status_anterior ? `<span class="badge ${r.status_anterior==='C'?'badge-c':'badge-f'}">${r.status_anterior}</span> → ` : 'Novo → ';
      const para = `<span class="badge ${r.status_novo==='C'?'badge-c':'badge-f'}">${r.status_novo}</span>`;
      return `<div class="hist-item">
        <div class="hist-nome">${r.nome}</div>
        <div class="hist-det">
          ${r.modulo === 'PIEP' ? 'PIEP' : 'Empregabilidade'} · Aula ${r.aula.replace('P','')} · ${de}${para} · ${dt}
        </div>
      </div>`;
    }).join('');
}

function toast(msg, erro) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (erro ? ' erro' : '') + ' show';
  setTimeout(() => t.className = 'toast', 2500);
}

window.onload = () => {
  document.getElementById('pin-screen').style.display = 'flex';
};