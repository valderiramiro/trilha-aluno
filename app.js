const SUPABASE_URL = 'https://joszmqohhceuxhsjxxcr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impvc3ptcW9oaGNldXhoc2p4eGNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyODEwNjEsImV4cCI6MjA5Njg1NzA2MX0.sSPFSYVtNGbgelrcQNK2mS-1KCk13A5ROid7E0YewIg';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let sessao = null; // { id, nome, usuario, perfil }
let turmaSelecionada = null;
let aulaAtiva = 1;
let alunoEditando = null;
let turmaEditando = null;
let usuarioEditando = null;
let professores = [];
let todosAlunos = [];

// ==================== AUTH ====================
async function fazerLogin() {
  const usuario = document.getElementById('login-usuario').value.trim().toUpperCase();
  const senha = document.getElementById('login-senha').value.trim();
  if (!usuario || !senha) { toast('Preencha usuário e senha', true); return; }
  const { data, error } = await sb.from('usuarios').select('*').eq('usuario', usuario).eq('senha', senha).eq('ativo', true).single();
  if (error || !data) { toast('Usuário ou senha incorretos', true); return; }
  sessao = data;
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('topbar-usuario').textContent = data.nome;
  document.getElementById('topbar-perfil').textContent = data.perfil;
  document.getElementById('topbar-perfil').className = `badge-perfil badge-${data.perfil.toLowerCase()}`;
  // Resetar todos os elementos opcionais
  document.getElementById('nav-usuarios').style.display = 'none';
  document.getElementById('nav-auditoria').style.display = 'none';
  document.getElementById('nav-alunos').style.display = 'none';
  document.getElementById('btn-nova-turma').style.display = 'none';

  // CRA — acesso total
  if (data.perfil === 'CRA') {
    document.getElementById('nav-usuarios').style.display = 'flex';
    document.getElementById('nav-auditoria').style.display = 'flex';
    document.getElementById('btn-nova-turma').style.display = 'inline-flex';
  }
  // SEC — criar turma, editar e gerenciar alunos
  if (data.perfil === 'SEC') {
    document.getElementById('btn-nova-turma').style.display = 'inline-flex';
    document.getElementById('nav-alunos').style.display = 'flex';
  }
  // CRA também vê aba alunos
  if (data.perfil === 'CRA') {
    document.getElementById('nav-alunos').style.display = 'flex';
  }
  await carregarProfessores();
  await carregarAlunos();
  setView('turmas');
}

function fazerLogout() {
  sessao = null;
  turmaSelecionada = null;
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-usuario').value = '';
  document.getElementById('login-senha').value = '';
}

// ==================== DADOS BASE ====================
async function carregarProfessores() {
  const { data } = await sb.from('usuarios').select('*').eq('perfil', 'PROF').eq('ativo', true);
  professores = data || [];
  const sel = document.getElementById('turma-professor');
  if (sel) {
    sel.innerHTML = professores.map(p => `<option value="${p.id}" data-nome="${p.usuario}">${p.nome}</option>`).join('');
  }
}

async function carregarAlunos() {
  todosAlunos = [];
  let pagina = 0;
  const tamanho = 1000;
  while (true) {
    const { data: lote } = await sb.from('alunos')
      .select('contrato, nome')
      .order('nome')
      .range(pagina * tamanho, (pagina + 1) * tamanho - 1);
    if (!lote || !lote.length) break;
    todosAlunos = [...todosAlunos, ...lote];
    if (lote.length < tamanho) break;
    pagina++;
  }
}

// ==================== NAVEGAÇÃO ====================
function setView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('view-' + view)?.classList.add('active');
  const navBtn = document.getElementById('nav-' + view);
  if (navBtn) navBtn.classList.add('active');
  if (view === 'turmas') carregarTurmas();
  if (view === 'usuarios') carregarUsuarios();
  if (view === 'auditoria') carregarAuditoria();
  if (view === 'alunos') renderAlunos();
}

// ==================== TURMAS ====================
async function carregarTurmas() {
  const lista = document.getElementById('turmas-lista');
  lista.innerHTML = '<div class="loading">Carregando...</div>';
  let query = sb.from('turmas').select('*, turma_alunos(count)').eq('ativa', true).order('criado_em', { ascending: false });
  // PROF só vê suas turmas
  if (sessao.perfil === 'PROF') query = query.eq('professor_id', sessao.id);
  const { data: turmas } = await query;
  if (!turmas || !turmas.length) {
    lista.innerHTML = '<div class="card"><div class="empty">Nenhuma turma encontrada.</div></div>';
    document.getElementById('turmas-stats').innerHTML = '';
    return;
  }
  const total = turmas.length;
  const totalAlunos = turmas.reduce((s, t) => s + (t.turma_alunos[0]?.count || 0), 0);
  document.getElementById('turmas-stats').innerHTML = `
    <div class="stat-card"><div class="stat-num">${total}</div><div class="stat-label">Turmas ativas</div></div>
    <div class="stat-card"><div class="stat-num">${totalAlunos}</div><div class="stat-label">Total de alunos</div></div>
    <div class="stat-card"><div class="stat-num">${turmas.reduce((s,t)=>s+(30-(t.turma_alunos[0]?.count||0)),0)}</div><div class="stat-label">Vagas disponíveis</div></div>`;
  lista.innerHTML = turmas.map(t => {
    const qtd = t.turma_alunos[0]?.count || 0;
    const pct = Math.min((qtd / 30) * 100, 100);
    const cheia = qtd >= 30;
    const turno = { MANHA: 'Manhã', TARDE: 'Tarde', NOITE: 'Noite', SABADO: 'Sábado' }[t.turno] || t.turno;
    const canEdit = sessao.perfil === 'CRA' || sessao.perfil === 'SEC';
    return `<div class="card turma-card" onclick="abrirTurma('${t.id}')">
      <div class="turma-card-header">
        <div class="turma-nome">${t.nome}</div>
        <div class="turma-actions" onclick="event.stopPropagation()">
          ${canEdit ? `<button class="btn-icon" onclick="editarTurma('${t.id}','${t.nome.replace(/'/g,"\\'")}')"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>` : ''}
        </div>
      </div>
      <div class="turma-meta">
        <span class="badge badge-${t.modulo.toLowerCase()}">${t.modulo}</span>
        <span class="badge badge-${t.turno.toLowerCase()}">${turno}</span>
        <span class="badge badge-prof">${t.professor_nome}</span>
        ${t.hora_inicio ? `<span style="font-size:12px;color:var(--text2)">🕐 ${t.hora_inicio}${t.hora_fim?' – '+t.hora_fim:''}</span>` : ''}
      </div>
      <div class="turma-vagas" style="margin-top:8px">
        ${qtd}/${30} alunos
        <span class="vagas-bar"><span class="vagas-fill ${cheia?'cheia':''}" style="width:${pct}%"></span></span>
        ${cheia ? '<span style="color:var(--red);font-size:11px;font-weight:600"> TURMA CHEIA</span>' : `<span style="font-size:11px;color:var(--text3)"> ${30-qtd} vagas</span>`}
      </div>
    </div>`;
  }).join('');
}

async function abrirTurma(turmaId) {
  const { data: turma } = await sb.from('turmas').select('*').eq('id', turmaId).single();
  turmaSelecionada = turma;
  document.getElementById('chamada-turma-nome').textContent = turma.nome;
  const turno = { MANHA: 'Manhã', TARDE: 'Tarde', NOITE: 'Noite', SABADO: 'Sábado' }[turma.turno];
  const horario = turma.hora_inicio ? ` · ${turma.hora_inicio}${turma.hora_fim?' – '+turma.hora_fim:''}` : '';
  document.getElementById('chamada-turma-info').textContent = `${turma.modulo} · ${turno} · Prof. ${turma.professor_nome}${horario}`;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-chamada').classList.add('active');
  aulaAtiva = 1;
  await renderAulasTabs();
  await carregarChamada(1);
}

function voltarTurmas() {
  turmaSelecionada = null;
  setView('turmas');
}

async function renderAulasTabs() {
  const { data: chamadas } = await sb.from('chamadas').select('*').eq('turma_id', turmaSelecionada.id);
  const tabs = document.getElementById('chamada-aulas');
  tabs.innerHTML = [1,2,3,4].map(n => {
    const ch = chamadas?.find(c => c.numero_aula === n);
    const fechada = ch?.fechada;
    return `<button class="aula-tab ${n===aulaAtiva?'active':''} ${fechada?'fechada':''}" onclick="selecionarAula(${n})" id="tab-aula-${n}">
      Aula ${n}${fechada ? ' 🔒' : ''}
    </button>`;
  }).join('');
}

async function selecionarAula(n) {
  aulaAtiva = n;
  document.querySelectorAll('.aula-tab').forEach((t,i) => t.classList.toggle('active', i+1 === n));
  await carregarChamada(n);
}

async function carregarChamada(aula) {
  const content = document.getElementById('chamada-content');
  content.innerHTML = '<div class="loading">Carregando...</div>';
  // Buscar ou criar chamada
  let { data: chamada } = await sb.from('chamadas').select('*').eq('turma_id', turmaSelecionada.id).eq('numero_aula', aula).single();
  if (!chamada) {
    const { data: nova } = await sb.from('chamadas').insert({ turma_id: turmaSelecionada.id, numero_aula: aula, data_aula: new Date().toISOString().split('T')[0] }).select().single();
    chamada = nova;
  }
  // Buscar alunos da turma
  const { data: turmaAlunos } = await sb.from('turma_alunos').select('*').eq('turma_id', turmaSelecionada.id).order('nome');
  // Buscar presenças
  const { data: presencas } = await sb.from('chamada_presencas').select('*').eq('chamada_id', chamada.id);
  const presMap = {};
  (presencas || []).forEach(p => presMap[p.contrato] = p);
  const alunos = turmaAlunos || [];
  const presentes = Object.values(presMap).filter(p => p.status === 'C').length;
  const ausentes = Object.values(presMap).filter(p => p.status === 'F').length;
  const bloqueado = chamada.fechada && sessao.perfil === 'PROF';
  const podeReabrir = chamada.fechada && sessao.perfil === 'CRA';
  const canAddRemove = sessao.perfil === 'CRA' || sessao.perfil === 'SEC';
  let html = `<div class="card">`;
  if (chamada.fechada) {
    html += `<div class="chamada-fechada-banner">🔒 Chamada fechada em ${new Date(chamada.fechada_em).toLocaleString('pt-BR')} por ${chamada.fechada_por}</div>`;
  }
  html += `<div class="chamada-header">
    <div class="chamada-stats">
      <div class="chamada-stat">👥 <span>${alunos.length}</span> alunos</div>
      <div class="chamada-stat" style="color:var(--green)">✅ <span>${presentes}</span> presentes</div>
      <div class="chamada-stat" style="color:var(--red)">❌ <span>${ausentes}</span> ausentes</div>
      <div class="chamada-stat" style="color:var(--text3)">— <span>${alunos.length - presentes - ausentes}</span> sem registro</div>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      ${canAddRemove ? `<button class="btn-secondary btn-sm" onclick="abrirModalAddAluno()">+ Aluno</button>` : ''}
      ${!chamada.fechada ? `<button class="btn-fechar" onclick="fecharChamada('${chamada.id}')">🔒 Fechar Chamada</button>` : ''}
      ${podeReabrir ? `<button class="btn-reabrir" onclick="reabrirChamada('${chamada.id}')">🔓 Reabrir</button>` : ''}
    </div>
  </div>`;
  if (!alunos.length) {
    html += `<div class="empty">Nenhum aluno nesta turma ainda.</div>`;
  } else {
    html += alunos.map(a => {
      const p = presMap[a.contrato];
      const status = p?.status || '';
      return `<div class="aluno-row" id="row-${a.contrato}">
        <div class="aluno-info">
          <div class="aluno-nome-row">${a.nome}</div>
          <div class="aluno-contrato-row">Contrato ${a.contrato}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="aluno-presenca">
            <button class="btn-presenca ${status==='C'?'ativo-c':''}" onclick="lancarPresenca('${chamada.id}','${a.contrato}','${a.nome.replace(/'/g,"\\'")}','C')" ${bloqueado?'disabled':''}>C</button>
            <button class="btn-presenca ${status==='F'?'ativo-f':''}" onclick="lancarPresenca('${chamada.id}','${a.contrato}','${a.nome.replace(/'/g,"\\'")}','F')" ${bloqueado?'disabled':''}>F</button>
          </div>
          ${canAddRemove ? `<button class="btn-icon danger" onclick="removerAlunoDaTurma('${a.id}','${a.nome.replace(/'/g,"\\'")}')"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg></button>` : ''}
          ${canAddRemove ? `<button class="btn-icon" onclick="editarAluno('${a.id}','${a.nome.replace(/'/g,"\\'")}','${a.contrato}')"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>` : ''}
        </div>
      </div>`;
    }).join('');
  }
  html += `</div>`;
  content.innerHTML = html;
}

async function lancarPresenca(chamadaId, contrato, nome, status) {
  await sb.from('chamada_presencas').upsert(
    { chamada_id: chamadaId, turma_id: turmaSelecionada.id, contrato, nome, status, lancado_por: sessao.usuario, lancado_em: new Date().toISOString() },
    { onConflict: 'chamada_id,contrato' }
  );
  // Registrar na auditoria
  await sb.from('auditoria').insert({ contrato, nome, modulo: turmaSelecionada.modulo, aula: `Aula ${aulaAtiva}`, status_anterior: null, status_novo: status, usuario: sessao.usuario });
  await carregarChamada(aulaAtiva);
}

async function fecharChamada(chamadaId) {
  if (!confirm('Fechar a chamada? O professor não poderá mais alterar.')) return;
  await sb.from('chamadas').update({ fechada: true, fechada_por: sessao.usuario, fechada_em: new Date().toISOString() }).eq('id', chamadaId);
  toast('Chamada fechada', false, true);
  await renderAulasTabs();
  await carregarChamada(aulaAtiva);
}

async function reabrirChamada(chamadaId) {
  await sb.from('chamadas').update({ fechada: false, fechada_por: null, fechada_em: null }).eq('id', chamadaId);
  toast('Chamada reaberta');
  await renderAulasTabs();
  await carregarChamada(aulaAtiva);
}

// ==================== MODAL TURMA ====================
function abrirModalTurma() {
  gerarNomeTurma();
  abrirModal('modal-turma');
}

function gerarNomeTurma() {
  const modulo = document.getElementById('turma-modulo')?.value || 'PIEP';
  const numero = String(document.getElementById('turma-numero')?.value || '1').padStart(2, '0');
  const mes = String(document.getElementById('turma-mes')?.value || '6').padStart(2, '0');
  const turno = document.getElementById('turma-turno')?.value || 'MANHA';
  const profSel = document.getElementById('turma-professor');
  const profNome = profSel?.options[profSel.selectedIndex]?.getAttribute('data-nome') || '';
  document.getElementById('turma-nome').value = `${modulo}${numero}-${mes}-${turno}-${profNome}`;
}

async function salvarTurma() {
  const nome = document.getElementById('turma-nome').value.trim();
  const modulo = document.getElementById('turma-modulo').value;
  const numero = parseInt(document.getElementById('turma-numero').value);
  const mes = parseInt(document.getElementById('turma-mes').value);
  const turno = document.getElementById('turma-turno').value;
  const hora_inicio = document.getElementById('turma-hora-inicio')?.value || null;
  const hora_fim = document.getElementById('turma-hora-fim')?.value || null;
  const profSel = document.getElementById('turma-professor');
  const professor_id = profSel.value;
  const professor_nome = profSel.options[profSel.selectedIndex].getAttribute('data-nome');
  if (!nome) { toast('Nome inválido', true); return; }
  const { error } = await sb.from('turmas').insert({ nome, modulo, numero, mes, turno, hora_inicio, hora_fim, professor_id, professor_nome, vagas: 30, criado_por: sessao.usuario });
  if (error) { toast('Erro: ' + (error.message.includes('unique') ? 'Turma já existe' : error.message), true); return; }
  toast('Turma criada com sucesso', false, true);
  fecharTodosModais();
  carregarTurmas();
}

function editarTurma(id, nome) {
  turmaEditando = id;
  document.getElementById('edit-turma-nome').value = nome;
  abrirModal('modal-editar-turma');
}

async function salvarEdicaoTurma() {
  const nome = document.getElementById('edit-turma-nome').value.trim();
  if (!nome) { toast('Nome inválido', true); return; }
  await sb.from('turmas').update({ nome }).eq('id', turmaEditando);
  toast('Turma atualizada');
  fecharTodosModais();
  carregarTurmas();
}

// ==================== ALUNOS NA TURMA ====================
function abrirModalAddAluno() {
  document.getElementById('add-aluno-busca').value = '';
  document.getElementById('add-aluno-resultados').innerHTML = '<div class="empty">Digite para buscar</div>';
  abrirModal('modal-add-aluno');
}

function normalizar(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function buscarAlunoModal() {
  const q = normalizar(document.getElementById('add-aluno-busca').value.trim());
  const el = document.getElementById('add-aluno-resultados');
  if (q.length < 2) { el.innerHTML = '<div class="empty">Digite para buscar</div>'; return; }
  const found = todosAlunos.filter(a => normalizar(a.nome).includes(q) || a.contrato.includes(q)).slice(0, 15);
  if (!found.length) { el.innerHTML = '<div class="empty">Nenhum aluno encontrado</div>'; return; }
  el.innerHTML = found.map(a => `
    <div class="result-item" onclick="addAlunoTurma('${a.contrato}','${a.nome.replace(/'/g,"\\'")}')">
      <div><div class="result-nome">${a.nome}</div><div class="result-sub">Contrato ${a.contrato}</div></div>
      <span style="color:var(--orange);font-weight:600">+</span>
    </div>`).join('');
}

async function addAlunoTurma(contrato, nome) {
  const { data: turmaAlunos } = await sb.from('turma_alunos').select('count').eq('turma_id', turmaSelecionada.id);
  const qtd = turmaAlunos?.[0]?.count || 0;
  if (qtd >= 30) { toast('Turma com vagas esgotadas', true); return; }
  const { error } = await sb.from('turma_alunos').insert({ turma_id: turmaSelecionada.id, contrato, nome, adicionado_por: sessao.usuario });
  if (error) {
    if (error.message.includes('unique')) toast('Aluno já está nesta turma', true);
    else toast('Erro ao adicionar', true);
    return;
  }
  toast(`${nome} adicionado`);
  await carregarChamada(aulaAtiva);
}

function editarAluno(id, nome, contrato) {
  alunoEditando = { id, turmaId: turmaSelecionada.id };
  document.getElementById('edit-aluno-nome').value = nome;
  document.getElementById('edit-aluno-contrato').value = contrato;
  abrirModal('modal-editar-aluno');
}

async function salvarEdicaoAluno() {
  const nome = document.getElementById('edit-aluno-nome').value.trim();
  const contrato = document.getElementById('edit-aluno-contrato').value.trim();
  if (!nome || !contrato) { toast('Preencha todos os campos', true); return; }
  // Atualizar tabela alunos
  await sb.from('alunos').update({ nome }).eq('contrato', contrato);
  // Atualizar turma_alunos se veio de dentro da turma
  if (alunoEditando?.id) {
    await sb.from('turma_alunos').update({ nome, contrato }).eq('id', alunoEditando.id);
    fecharTodosModais();
    await carregarChamada(aulaAtiva);
  } else {
    // Veio da busca — atualizar turma_alunos pelo contrato
    await sb.from('turma_alunos').update({ nome }).eq('contrato', alunoEditando.contrato);
    // Atualizar lista local
    const idx = todosAlunos.findIndex(a => a.contrato === alunoEditando.contrato);
    if (idx >= 0) todosAlunos[idx].nome = nome;
    fecharTodosModais();
    // Recarregar detalhe
    await verDetalheAluno(contrato);
  }
  toast('Aluno atualizado');
}

async function removerAlunoDaTurma(id, nome) {
  if (!confirm(`Remover ${nome} desta turma?`)) return;
  await sb.from('turma_alunos').delete().eq('id', id);
  toast(`${nome} removido`);
  await carregarChamada(aulaAtiva);
}

// ==================== GESTÃO DE ALUNOS ====================
let alunosFiltrados = [];

function renderAlunos() {
  alunosFiltrados = [...todosAlunos];
  document.getElementById('alunos-total').textContent = `(${todosAlunos.length} alunos)`;
  document.getElementById('alunos-busca-input').value = '';
  exibirListaAlunos(alunosFiltrados.slice(0, 50));
}

function filtrarAlunos() {
  const q = normalizar(document.getElementById('alunos-busca-input').value.trim());
  if (q.length < 2) {
    exibirListaAlunos(todosAlunos.slice(0, 50));
    return;
  }
  alunosFiltrados = todosAlunos.filter(a => normalizar(a.nome).includes(q) || a.contrato.includes(q));
  exibirListaAlunos(alunosFiltrados.slice(0, 100));
}

function exibirListaAlunos(lista) {
  const el = document.getElementById('alunos-lista');
  if (!lista.length) { el.innerHTML = '<div class="empty">Nenhum aluno encontrado</div>'; return; }
  el.innerHTML = lista.map(a => `
    <div class="result-item">
      <div>
        <div class="result-nome">${a.nome}</div>
        <div class="result-sub">Contrato ${a.contrato}</div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn-icon" onclick="editarAlunoGlobal('${a.contrato}','${a.nome.replace(/'/g,"\'")}')">
          <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
      </div>
    </div>`).join('');
}

function abrirModalNovoAluno() {
  document.getElementById('novo-aluno-nome').value = '';
  document.getElementById('novo-aluno-contrato').value = '';
  abrirModal('modal-novo-aluno');
}

async function salvarNovoAluno() {
  const nome = document.getElementById('novo-aluno-nome').value.trim();
  const contrato = document.getElementById('novo-aluno-contrato').value.trim();
  if (!nome || !contrato) { toast('Preencha nome e contrato', true); return; }
  if (todosAlunos.find(a => a.contrato === contrato)) { toast('Contrato já cadastrado', true); return; }
  const { error } = await sb.from('alunos').insert({ contrato, nome, ano: '2026' });
  if (error) { toast('Erro ao salvar', true); return; }
  todosAlunos.push({ contrato, nome });
  todosAlunos.sort((a, b) => a.nome.localeCompare(b.nome));
  toast(`${nome} cadastrado`, false, true);
  fecharTodosModais();
  renderAlunos();
}

function editarAlunoGlobal(contrato, nome) {
  alunoEditando = { id: null, contrato };
  document.getElementById('edit-aluno-nome').value = nome;
  document.getElementById('edit-aluno-contrato').value = contrato;
  abrirModal('modal-editar-aluno');
}

// ==================== BUSCA ALUNO ====================
async function buscarAluno() {
  const q = normalizar(document.getElementById('busca-input').value.trim());
  const el = document.getElementById('busca-resultados');
  if (q.length < 2) { el.innerHTML = ''; return; }
  const found = todosAlunos.filter(a => normalizar(a.nome).includes(q) || a.contrato.includes(q)).slice(0, 20);
  if (!found.length) { el.innerHTML = '<div class="card"><div class="empty">Nenhum aluno encontrado</div></div>'; return; }
  el.innerHTML = `<div class="results-box">${found.map(a => `
    <div class="result-item" onclick="verDetalheAluno('${a.contrato}')">
      <div><div class="result-nome">${a.nome}</div><div class="result-sub">Contrato ${a.contrato}</div></div>
      <span>›</span>
    </div>`).join('')}</div>`;
}

async function verDetalheAluno(contrato) {
  document.getElementById('busca-resultados').style.display = 'none';
  document.getElementById('busca-input').style.display = 'none';
  const det = document.getElementById('busca-detalhe');
  det.style.display = 'block';
  const card = document.getElementById('busca-detalhe-card');
  card.innerHTML = '<div class="loading">Carregando...</div>';

  const aluno = todosAlunos.find(a => a.contrato === contrato);
  const { data: presencas, error: errP } = await sb.from('presencas').select('*').eq('contrato', contrato);
  const { data: turmasAluno } = await sb.from('turma_alunos').select('*, turmas(nome, modulo)').eq('contrato', contrato);
  const { data: chamadaPresencas } = await sb.from('chamada_presencas')
    .select('*, chamadas!inner(numero_aula, fechada, turma_id, turmas!inner(nome, modulo))')
    .eq('contrato', contrato);
  console.log('presencas:', presencas, errP);
  console.log('turmasAluno:', turmasAluno);
  console.log('chamadaPresencas:', chamadaPresencas);

  const podeEditar = sessao.perfil === 'CRA' || sessao.perfil === 'SEC';
  let html = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1.25rem">
      <div>
        <div style="font-size:17px;font-weight:600;margin-bottom:4px">${aluno?.nome || contrato}</div>
        <div style="font-size:13px;color:var(--text3)">Contrato ${contrato}</div>
      </div>
      ${podeEditar ? `<button class="btn-secondary btn-sm" onclick="editarAlunoBusca('${contrato}','${(aluno?.nome||'').replace(/'/g,"\'")}')">Editar</button>` : ''}
    </div>`;

  // Turmas vinculadas
  if (turmasAluno?.length) {
    html += `<div class="modulo-label">Turmas vinculadas</div>`;
    html += `<div style="display:flex;flex-direction:column;gap:4px;margin-bottom:1rem">`;
    html += turmasAluno.map(t => `<div style="font-size:13px;padding:6px 10px;background:var(--bg);border-radius:var(--radius);border:0.5px solid var(--border)">${t.turmas?.nome || '—'} <span class="badge badge-${(t.turmas?.modulo||'').toLowerCase()}">${t.turmas?.modulo||''}</span></div>`).join('');
    html += `</div>`;
  }

  // Presenças por chamada (novo sistema)
  if (chamadaPresencas?.length) {
    html += `<div class="modulo-label">Chamadas registradas</div>`;
    const porTurma = {};
    chamadaPresencas.forEach(cp => {
      const turmaKey = cp.chamadas?.turmas?.nome || cp.chamadas?.turma_id || 'Turma desconhecida';
      if (!porTurma[turmaKey]) porTurma[turmaKey] = [];
      porTurma[turmaKey].push(cp);
    });
    Object.entries(porTurma).forEach(([turma, cps]) => {
      html += `<div style="font-size:13px;font-weight:600;margin:8px 0 6px;color:var(--text2)">${turma}</div>`;
      html += `<div class="aulas-grid">`;
      [1,2,3,4].forEach(n => {
        const cp = cps.find(x => x.chamadas?.numero_aula === n);
        const cls = cp?.status === 'C' ? 'presente' : cp?.status === 'F' ? 'falta' : '';
        const val = cp?.status || '—';
        const dt = cp ? new Date(cp.lancado_em).toLocaleDateString('pt-BR') : '';
        html += `<div class="aula-box ${cls}">
          <div class="aula-num">Aula ${n}</div>
          <div class="aula-val">${val}</div>
          ${dt ? `<div class="aula-dt">${dt}</div>` : ''}
        </div>`;
      });
      html += `</div>`;
    });
  }

  // Presenças legado (tabela presencas antiga)
  const temLegado = (presencas || []).length > 0;
  if (temLegado) {
    html += `<div class="modulo-label" style="margin-top:1rem">Histórico (dados anteriores)</div>`;
    ['PIEP','EMP'].forEach(mod => {
      const ps = (presencas || []).filter(p => p.modulo === mod);
      if (!ps.length) return;
      html += `<div style="font-size:12px;font-weight:600;color:var(--text3);margin:8px 0 4px">${mod === 'EMP' ? 'Empregabilidade' : 'PIEP'}</div>`;
      html += `<div class="aulas-grid">`;
      ['P1','P2','P3','P4'].forEach((aula, i) => {
        const p = ps.find(x => x.aula === aula);
        const cls = p?.status === 'C' ? 'presente' : p?.status === 'F' ? 'falta' : '';
        const val = p?.status || '—';
        const dt = p ? new Date(p.atualizado_em || p.criado_em).toLocaleDateString('pt-BR') : '';
        html += `<div class="aula-box ${cls}">
          <div class="aula-num">Aula ${i+1}</div>
          <div class="aula-val">${val}</div>
          ${dt ? `<div class="aula-dt">${dt}</div>` : ''}
        </div>`;
      });
      html += `</div>`;
    });
  }

  if (!turmasAluno?.length && !chamadaPresencas?.length && !temLegado) {
    html += `<div class="empty">Nenhum dado encontrado para este aluno.</div>`;
  }

  card.innerHTML = html;
}

function voltarBusca() {
  document.getElementById('busca-resultados').style.display = 'block';
  document.getElementById('busca-input').style.display = 'block';
  document.getElementById('busca-detalhe').style.display = 'none';
}

function editarAlunoBusca(contrato, nome) {
  alunoEditando = { id: null, contrato };
  document.getElementById('edit-aluno-nome').value = nome;
  document.getElementById('edit-aluno-contrato').value = contrato;
  abrirModal('modal-editar-aluno');
}

// ==================== USUÁRIOS ====================
async function carregarUsuarios() {
  const lista = document.getElementById('usuarios-lista');
  lista.innerHTML = '<div class="loading">Carregando...</div>';
  const { data } = await sb.from('usuarios').select('*').order('nome');
  if (!data?.length) { lista.innerHTML = '<div class="card"><div class="empty">Nenhum usuário.</div></div>'; return; }
  lista.innerHTML = data.map(u => `
    <div class="card">
      <div class="usuario-card">
        <div class="usuario-info">
          <div class="usuario-nome">${u.nome}</div>
          <div class="usuario-login">${u.usuario} · <span class="badge badge-${u.perfil.toLowerCase()}">${u.perfil}</span></div>
        </div>
        <div class="usuario-actions">
          <span class="badge ${u.ativo?'badge-ativo':'badge-inativo'}">${u.ativo?'Ativo':'Inativo'}</span>
          <button class="btn-icon" onclick="editarUsuario('${u.id}','${u.nome.replace(/'/g,"\\'")}','${u.usuario}','${u.senha}','${u.perfil}')"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="btn-icon ${u.ativo?'danger':''}" onclick="toggleUsuario('${u.id}',${u.ativo})"><svg viewBox="0 0 24 24">${u.ativo?'<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>':'<polyline points="20 6 9 17 4 12"/>'}</svg></button>
        </div>
      </div>
    </div>`).join('');
}

function abrirModalUsuario() {
  usuarioEditando = null;
  document.getElementById('modal-usuario-titulo').textContent = 'Novo Usuário';
  document.getElementById('usuario-nome').value = '';
  document.getElementById('usuario-login').value = '';
  document.getElementById('usuario-senha').value = '';
  document.getElementById('usuario-perfil').value = 'PROF';
  abrirModal('modal-usuario');
}

function editarUsuario(id, nome, login, senha, perfil) {
  usuarioEditando = id;
  document.getElementById('modal-usuario-titulo').textContent = 'Editar Usuário';
  document.getElementById('usuario-nome').value = nome;
  document.getElementById('usuario-login').value = login;
  document.getElementById('usuario-senha').value = senha;
  document.getElementById('usuario-perfil').value = perfil;
  abrirModal('modal-usuario');
}

async function salvarUsuario() {
  const nome = document.getElementById('usuario-nome').value.trim();
  const usuario = document.getElementById('usuario-login').value.trim().toUpperCase();
  const senha = document.getElementById('usuario-senha').value.trim();
  const perfil = document.getElementById('usuario-perfil').value;
  if (!nome || !usuario || !senha) { toast('Preencha todos os campos', true); return; }
  if (usuarioEditando) {
    await sb.from('usuarios').update({ nome, usuario, senha, perfil }).eq('id', usuarioEditando);
    toast('Usuário atualizado');
  } else {
    const { error } = await sb.from('usuarios').insert({ nome, usuario, senha, perfil });
    if (error) { toast('Erro: usuário já existe', true); return; }
    toast('Usuário criado', false, true);
  }
  fecharTodosModais();
  carregarUsuarios();
  carregarProfessores();
}

async function toggleUsuario(id, ativo) {
  const acao = ativo ? 'desativar' : 'ativar';
  if (!confirm(`Deseja ${acao} este usuário?`)) return;
  await sb.from('usuarios').update({ ativo: !ativo }).eq('id', id);
  toast(`Usuário ${ativo ? 'desativado' : 'ativado'}`);
  carregarUsuarios();
}

// ==================== AUDITORIA ====================
async function carregarAuditoria() {
  const el = document.getElementById('auditoria-lista');
  el.innerHTML = '<div class="loading">Carregando...</div>';
  const { data } = await sb.from('auditoria').select('*').order('momento', { ascending: false }).limit(100);
  if (!data?.length) { el.innerHTML = '<div class="empty">Nenhum registro.</div>'; return; }
  el.innerHTML = data.map(r => {
    const dt = new Date(r.momento).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    const de = r.status_anterior ? `<span class="badge badge-${r.status_anterior==='C'?'c':'f'}">${r.status_anterior}</span> → ` : 'Novo → ';
    const para = `<span class="badge badge-${r.status_novo==='C'?'c':'f'}">${r.status_novo}</span>`;
    return `<div class="audit-item">
      <div class="audit-nome">${r.nome}</div>
      <div class="audit-det">${r.modulo} · ${r.aula} · ${de}${para} · <strong>${r.usuario || '—'}</strong> · ${dt}</div>
    </div>`;
  }).join('');
}

// ==================== MODAIS ====================
function abrirModal(id) {
  document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
  document.getElementById(id).style.display = 'block';
  document.getElementById('modal-overlay').classList.add('open');
}

function fecharTodosModais() {
  document.getElementById('modal-overlay').classList.remove('open');
  document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
}

function fecharModal(e) {
  if (e.target === document.getElementById('modal-overlay')) fecharTodosModais();
}

// ==================== TOAST ====================
function toast(msg, erro, ok) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (erro ? ' erro' : ok ? ' ok' : '');
  setTimeout(() => t.className = 'toast', 2500);
}

// ==================== INIT ====================
window.onload = () => {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
};
