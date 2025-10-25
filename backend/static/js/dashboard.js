// ====================
// Helpers HTTP
// ====================
// realiza requisições fetch e converter para JSON
async function fetchJSON(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.status === 204 ? null : res.json();
}

// ====================
// Listagem de maquetes
// ====================
// carregatodas as maquetes e preencher a tabela
async function loadMaquetes() {
  const body = document.getElementById('maquetes-body');
  const cards = document.getElementById('maquetes-cards');
  if (body) body.innerHTML = '<tr><td colspan="6" class="muted">Carregando…</td></tr>';
  if (cards) cards.innerHTML = '<div class="muted">Carregando…</div>';
  try {
    const maquetes = await fetchJSON('/api/maquetes');

    // Tabela
    if (body) {
      if (!maquetes || maquetes.length === 0) {
        body.innerHTML = '<tr><td colspan="6" class="empty">Nenhuma maquete cadastrada</td></tr>';
      } else {
        body.innerHTML = maquetes.map(m => `
          <tr>
            <td>${m.id}</td>
            <td>${m.nome ?? ''}</td>
            <td>${m.escala ?? ''}</td>
            <td>${m.proprietario ?? ''}</td>
            <td>${m.imagem_principal_url ? '<a href="' + m.imagem_principal_url + '" target="_blank">Abrir</a>' : ''}</td>
            <td class="actions">
              <button class="btn primary" data-edit="${m.id}">Editar</button>
              <button class="btn danger" data-del="${m.id}">Excluir</button>
            </td>
          </tr>
        `).join('');
        // Bind excluir
        document.querySelectorAll('[data-del]').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-del');
            if (!confirm('Confirma excluir a maquete #' + id + '?')) return;
            try {
              await fetchJSON(`/api/maquetes/${id}`, { method: 'DELETE' });
              await loadMaquetes();
            } catch (err) {
              alert('Erro ao excluir: ' + err.message);
            }
          });
        });
        // Bind editar
        document.querySelectorAll('[data-edit]').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-edit');
            const tr = btn.closest('tr');
            try {
              const m = await fetchJSON(`/api/maquetes/${id}`);
              tr.innerHTML = `
                <td>${id}</td>
                <td><input type="text" value="${m.nome ?? ''}" data-field="nome"></td>
                <td><input type="text" value="${m.escala ?? ''}" data-field="escala"></td>
                <td><input type="text" value="${m.proprietario ?? ''}" data-field="proprietario"></td>
                <td><input type="url" value="${m.imagem_principal_url ?? ''}" data-field="imagem_principal_url"></td>
                <td class="actions">
                  <button class="primary" data-save="${id}">Salvar</button>
                  <button class="secondary" data-cancel>Cancelar</button>
                </td>
              `;
              const saveBtn = tr.querySelector('[data-save]');
              const cancelBtn = tr.querySelector('[data-cancel]');
              saveBtn.addEventListener('click', async () => {
                const payload = {};
                tr.querySelectorAll('input[data-field]').forEach(inp => payload[inp.dataset.field] = inp.value);
                try {
                  await fetchJSON(`/api/maquetes/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload),
                  });
                  await loadMaquetes();
                } catch (err) {
                  alert('Erro ao atualizar: ' + err.message);
                }
              });
              cancelBtn.addEventListener('click', () => loadMaquetes());
            } catch (err) {
              alert('Erro ao carregar maquete: ' + err.message);
            }
          });
        });
      }
    }

    // Cards
    if (cards) {
      if (!maquetes || maquetes.length === 0) {
        cards.innerHTML = '<div class="muted">Sem maquetes cadastradas</div>';
      } else {
        cards.innerHTML = maquetes.map(m => {
          const img = m.imagem_principal_url || '';
          return `
            <div class="card" title="Maquete #${m.id}">
              ${img ? `<img class="thumb" src="${img}" alt="">` : `<div class="thumb" style="background:#f1f5ff; border:1px dashed var(--line);"></div>`}
              <div class="title">${m.nome ?? 'Sem título'}</div>
              <div class="meta">ID ${m.id}${m.escala ? ' • Escala ' + m.escala : ''}${m.proprietario ? ' • ' + m.proprietario : ''}</div>
            </div>
          `;
        }).join('');
      }
    }
  } catch (err) {
    if (body) body.innerHTML = `<tr><td colspan="6" class="muted">Erro: ${err.message}</td></tr>`;
    if (cards) cards.innerHTML = `<div class="muted">Erro: ${err.message}</div>`;
  }
}

// ====================
// Criação de maquete
// ====================
// envia dados do formulário para criar uma maquete
async function handleCreate(ev) {
  ev.preventDefault();
  const form = ev.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  try {
    await fetchJSON('/api/maquetes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    form.reset();
    await loadMaquetes();
  } catch (err) {
    alert('Erro ao criar: ' + err.message);
  }
}

// ====================
// Inicialização
// ====================

// Status do banco (health)
async function updateHealthStatus() {
  const el = document.getElementById('db-status');
  if (!el) return;
  try {
    const res = await fetch('/health');
    const data = await res.json();
    if (data.db === 'ok') {
      el.textContent = 'DB: ok';
      el.classList.remove('error', 'muted');
      el.classList.add('ok');
    } else if (data.db === 'missing_config') {
      el.textContent = 'DB: sem configuração';
      el.classList.remove('ok');
      el.classList.add('error');
    } else {
      el.textContent = 'DB: erro';
      el.classList.remove('ok');
      el.classList.add('error');
    }
  } catch (err) {
    el.textContent = 'DB: erro';
    el.classList.remove('ok');
    el.classList.add('error');
  }
}

// Controles de janela
function openCadastroWindow() {
  document.getElementById('window-overlay')?.classList.remove('hidden');
  document.getElementById('cadastro-window')?.classList.remove('hidden');
}
function closeCadastroWindow() {
  document.getElementById('window-overlay')?.classList.add('hidden');
  document.getElementById('cadastro-window')?.classList.add('hidden');
}
function bindWindowControls() {
  const openBtn = document.getElementById('open-cadastro');
  const closeBtn = document.getElementById('close-window');
  const overlay = document.getElementById('window-overlay');
  openBtn?.addEventListener('click', openCadastroWindow);
  closeBtn?.addEventListener('click', closeCadastroWindow);
  overlay?.addEventListener('click', closeCadastroWindow);
}

// ====================
// Cloudinary - Upload de imagem principal
// ====================
function setupCloudinaryUpload() {
  const cloudName = document.body?.dataset?.cloudinaryCloudName;
  const uploadPreset = document.body?.dataset?.cloudinaryUploadPreset;
  const fileInput = document.getElementById('file-imagem-principal');
  const preview = document.getElementById('preview-imagem-principal');
  const urlInput = document.getElementById('input-imagem-principal');

  if (!fileInput || !preview || !urlInput) return;

  // Se não houver configuração, desabilitar input para evitar erro
  if (!cloudName || !uploadPreset) {
    fileInput.disabled = true;
    fileInput.title = 'Configure CLOUDINARY_CLOUD_NAME e CLOUDINARY_UPLOAD_PRESET no servidor';
    return;
  }

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) {
      preview.style.display = 'none';
      return;
    }

    // Preview local
    const reader = new FileReader();
    reader.onload = (ev) => {
      preview.src = ev.target.result;
      preview.style.display = 'block';
    };
    reader.readAsDataURL(file);

    // Upload para Cloudinary (unsigned)
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', uploadPreset);

      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error(`Upload falhou (${res.status})`);
      const data = await res.json();
      urlInput.value = data.secure_url || '';
    } catch (err) {
      alert('Erro ao enviar imagem: ' + err.message);
    }
  });
}

// Navegação do dashboard (sidebar -> views)
function initNavigation() {
  const items = Array.from(document.querySelectorAll('.menu-item'));
  const views = Array.from(document.querySelectorAll('.view'));
  if (items.length === 0 || views.length === 0) return;
  const showView = (id) => {
    views.forEach(v => v.classList.toggle('active', v.id === id));
    items.forEach(i => i.classList.toggle('active', i.getAttribute('data-target') === id));
    if (id === 'view-maquetes') loadMaquetes();
    if (id === 'view-info') loadInfoKpis();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  items.forEach(i => {
    i.addEventListener('click', () => {
      const target = i.getAttribute('data-target');
      if (target) showView(target);
    });
  });
}

// KPIs da aba Info
async function loadInfoKpis() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  try {
    const maquetes = await fetchJSON('/api/maquetes');
    const total = maquetes?.length ?? 0;
    const comImagem = (maquetes || []).filter(m => !!m.imagem_principal_url).length;
    const semImagem = total - comImagem;
    set('kpi-total', total);
    set('kpi-com-imagem', comImagem);
    set('kpi-sem-imagem', semImagem);
  } catch (err) {
    // Se falhar, deixa valores atuais; opcionalmente marcar como erro
    set('kpi-total', '—');
    set('kpi-com-imagem', '—');
    set('kpi-sem-imagem', '—');
  }
}

// Limpar formulário de cadastro
function bindFormReset() {
  const btn = document.getElementById('btn-limpar-form');
  const form = document.getElementById('create-form');
  const fileInput = document.getElementById('file-imagem-principal');
  const urlInput = document.getElementById('input-imagem-principal');
  const preview = document.getElementById('preview-imagem-principal');
  if (!btn || !form) return;
  btn.addEventListener('click', () => {
    form.reset();
    if (fileInput) fileInput.value = '';
    if (urlInput) urlInput.value = '';
    if (preview) {
      preview.src = '';
      preview.style.display = 'none';
    }
  });
}
// Botão Recarregar na view Maquetes
function bindReloadMaquetes() {
  const btn = document.getElementById('btn-recarregar-maquetes');
  if (!btn) return;
  btn.addEventListener('click', () => loadMaquetes());
}
// Botão Recarregar na view Info
function bindReloadInfo() {
  const btn = document.getElementById('btn-recarregar-info');
  if (!btn) return;
  btn.addEventListener('click', () => loadInfoKpis());
}

window.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('create-form');
  if (form) form.addEventListener('submit', handleCreate);
  setupCloudinaryUpload();
  initNavigation();
  bindFormReset();
  bindReloadMaquetes();
  bindReloadInfo();
  updateHealthStatus();
});