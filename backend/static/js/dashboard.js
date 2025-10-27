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
// UI: toast simples de sucesso/erro (centralizado)
function showToast(message, type = 'success') {
  try {
    const el = document.createElement('div');
    el.textContent = message;
    el.setAttribute('role', 'status');
    el.style.position = 'fixed';
    el.style.top = '50%';
    el.style.left = '50%';
    el.style.transform = 'translate(-50%, -50%) scale(0.96)';
    el.style.zIndex = '1000';
    el.style.background = type === 'success' ? '#16a34a' : '#ef4444';
    el.style.color = '#fff';
    el.style.padding = '12px 18px';
    el.style.borderRadius = '10px';
    el.style.boxShadow = '0 10px 30px rgba(0,0,0,0.25)';
    el.style.fontSize = '16px';
    el.style.fontWeight = '700';
    el.style.letterSpacing = '0.3px';
    el.style.opacity = '0';
    el.style.transition = 'opacity .18s ease, transform .18s ease';
    document.body.appendChild(el);
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translate(-50%, -50%) scale(1)';
    });
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translate(-50%, -50%) scale(0.96)';
      el.addEventListener('transitionend', () => el.remove(), { once: true });
    }, 2200);
  } catch (_) {
    // fallback
    alert(message);
  }
}
// UI: overlay de carregamento (com spinner)
function showLoading(message = 'Carregando...') {
  try {
    let overlay = document.getElementById('loading-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'loading-overlay';
      overlay.style.position = 'fixed';
      overlay.style.inset = '0';
      overlay.style.background = 'rgba(0,0,0,0.35)';
      overlay.style.backdropFilter = 'blur(2px)';
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';
      overlay.style.zIndex = '999';

      const box = document.createElement('div');
      box.style.background = '#fff';
      box.style.borderRadius = '12px';
      box.style.padding = '16px 20px';
      box.style.boxShadow = '0 10px 30px rgba(0,0,0,0.25)';
      box.style.display = 'flex';
      box.style.alignItems = 'center';
      box.style.gap = '12px';
      box.style.minWidth = '240px';
      box.style.justifyContent = 'center';

      const spinner = document.createElement('div');
      spinner.style.width = '24px';
      spinner.style.height = '24px';
      spinner.style.border = '3px solid #e5e7eb';
      spinner.style.borderTopColor = '#2563eb';
      spinner.style.borderRadius = '50%';
      spinner.style.animation = 'spin .8s linear infinite';

      const text = document.createElement('div');
      text.className = 'loading-text';
      text.textContent = message;
      text.style.fontSize = '15px';
      text.style.color = '#111827';
      text.style.fontWeight = '600';

      box.appendChild(spinner);
      box.appendChild(text);
      overlay.appendChild(box);
      document.body.appendChild(overlay);

      // injeta keyframes do spinner apenas uma vez
      if (!document.getElementById('loading-keyframes')) {
        const style = document.createElement('style');
        style.id = 'loading-keyframes';
        style.textContent = '@keyframes spin { from{ transform: rotate(0deg);} to{ transform: rotate(360deg);} }';
        document.head.appendChild(style);
      }
    } else {
      const text = overlay.querySelector('.loading-text');
      if (text) text.textContent = message;
      overlay.style.display = 'flex';
    }
  } catch (err) {
    console.warn('Falha ao exibir loading:', err);
  }
}
function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = 'none';
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
        body.querySelectorAll('[data-del]').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-del');
            try {
              await fetchJSON(`/api/maquetes/${id}`, { method: 'DELETE' });
              await loadMaquetes();
              showToast('Maquete excluída', 'success');
            } catch (err) {
              alert('Erro ao excluir: ' + err.message);
            }
          });
        });
        // Adiciona binding para edição na tabela
        body.querySelectorAll('[data-edit]').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-edit');
            if (id) {
              window.location.href = `/admin/maquetes/${id}/editar`;
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
          const img = m.imagem_principal_public_id ? cloudinaryThumbUrl(m.imagem_principal_public_id, 240, 160) : (m.imagem_principal_url || '');
          return `
            <div class="card" title="Maquete #${m.id}">
              ${img ? `<img class="thumb" src="${img}" alt="" loading="lazy">` : `<div class="thumb" style="background:#f1f5ff; border:1px dashed var(--line);"></div>`}
              <div class="title">${m.nome ?? 'Sem título'}</div>
              <div class="meta">ID ${m.id}${m.escala ? ' • Escala ' + m.escala : ''}${m.proprietario ? ' • ' + m.proprietario : ''}</div>
              <div class="card-actions">
                <button class="primary" data-edit-card="${m.id}">Editar</button>
                <button class="btn danger" data-del-card="${m.id}">Excluir</button>
              </div>
            </div>
          `;
        }).join('');

        // Bind excluir nos cartões
        cards.querySelectorAll('[data-del-card]').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-del-card');
            if (!id) return;
            if (!confirm('Excluir maquete #' + id + '?')) return;
            try {
              await fetchJSON(`/api/maquetes/${id}`, { method: 'DELETE' });
              await loadMaquetes();
              showToast('Maquete excluída', 'success');
            } catch (err) {
              alert('Erro ao excluir: ' + err.message);
            }
          });
        });
        // Bind editar nos cartões
        cards.querySelectorAll('[data-edit-card]').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-edit-card');
            if (id) {
              window.location.href = `/admin/maquetes/${id}/editar`;
            }
          });
        });
      }
    }
  } catch (err) {
    alert('Erro ao carregar maquetes: ' + err.message);
  }
}

// ====================
// Criação de maquete
// ====================
// envia dados do formulário para criar uma maquete (com loading)
async function handleCreate(ev) {
  ev.preventDefault();
  const form = ev.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  // Garantir campos não nulos para compatibilidade com backend antigo
  data.info = (data.info ?? '').trim();
  if (typeof data.imagem_principal_url === 'string') {
    data.imagem_principal_url = data.imagem_principal_url.replace(/`/g, '').trim();
  }
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn?.textContent;
  submitBtn?.setAttribute('disabled', 'true');
  if (submitBtn) submitBtn.textContent = 'Criando...';
  showLoading('Criando maquete...');
  try {
    const res = await fetchJSON('/api/maquetes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    const newId = res?.id;
    // Vincular imagens secundárias se houver uploads bem sucedidos
    const hasUploads = cadastroSecundarias.some(img => img.public_id || img.url);
    if (!hasUploads && cadastroSecundarias.length > 0) {
      alert('Cloudinary não configurado: as imagens secundárias selecionadas não serão salvas.');
    }
    if (newId && hasUploads) {
      const toLink = cadastroSecundarias.filter(img => img.public_id || img.url);
      await Promise.allSettled(toLink.map(img =>
        fetchJSON(`/api/maquetes/${newId}/images`, {
          method: 'POST',
          body: JSON.stringify({ public_id: img.public_id || '', url: img.url || '' }),
        })
      ));
    }
    form.reset();
    resetCadastroSecundarias();
    await loadMaquetes();
    showToast('Maquete Cadastrada', 'success');
  } catch (err) {
    alert('Erro ao criar: ' + err.message);
  } finally {
    hideLoading();
    if (submitBtn) {
      submitBtn.removeAttribute('disabled');
      submitBtn.textContent = originalText || 'Cadastrar';
    }
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
  const publicIdInput = document.getElementById('input-public-id-principal');

  if (!fileInput || !preview || !urlInput) return;

  // Mesmo sem configuração do Cloudinary, permitir seleção e preview local
  const isCloudReady = !!(cloudName && uploadPreset);
  if (!isCloudReady) {
    fileInput.title = 'Cloudinary não configurado: faremos apenas o preview local.';
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

    // Upload para Cloudinary (unsigned) se configurado
    if (isCloudReady) {
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
        if (publicIdInput) publicIdInput.value = data.public_id || '';
        // Atualiza preview para versão thumb do Cloudinary, evitando carregar imagem grande
        const thumbCloud = cloudinaryThumbUrl(data.public_id, 320, 220) || data.secure_url;
        if (thumbCloud) {
          preview.src = thumbCloud;
          preview.style.display = 'block';
        }
      } catch (err) {
        alert('Erro ao enviar imagem: ' + err.message);
      }
    } else {
      // Sem Cloudinary: limpar campos de URL/public_id para evitar confusão
      urlInput.value = '';
      if (publicIdInput) publicIdInput.value = '';
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
    if (id === 'view-maquetes') { loadMaquetes(); loadGaleriaForSelected(); }
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
  const fileSec = document.getElementById('file-imagens-secundarias');
  if (!btn || !form) return;
  btn.addEventListener('click', () => {
    form.reset();
    if (fileInput) fileInput.value = '';
    if (urlInput) urlInput.value = '';
    if (preview) {
      preview.src = '';
      preview.style.display = 'none';
    }
    if (fileSec) fileSec.value = '';
    resetCadastroSecundarias();
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

function bindCustomFileButtons() {
  document.querySelectorAll('.file-input-wrapper').forEach(wrapper => {
    const btn = wrapper.querySelector('.btn-upload');
    const input = wrapper.querySelector('input[type="file"]');
    if (btn && input) {
      btn.addEventListener('click', () => input.click());
    }
  });
}

window.addEventListener('DOMContentLoaded', () => {
  try {
    // Priorizar navegação para que abas funcionem mesmo se algo falhar
    initNavigation();
    const form = document.getElementById('create-form');
    if (form) form.addEventListener('submit', handleCreate);
    setupCloudinaryUpload();
    setupCadastroSecundariasUpload();
    bindCustomFileButtons();
    bindFormReset();
    bindReloadMaquetes();
    bindReloadInfo();
    bindGaleriaControls();
    updateHealthStatus();
  } catch (err) {
    console.error('Falha na inicialização do dashboard:', err);
    // Ainda tentar habilitar navegação caso o erro tenha ocorrido cedo
    try { initNavigation(); } catch {}
  }
});

// Galeria Secundária
function refreshGaleriaSelect(maquetes) {
  const sel = document.getElementById('select-maquete-galeria');
  if (!sel) return;
  sel.innerHTML = '';
  const list = maquetes || [];
  if (list.length === 0) {
    sel.innerHTML = '<option value="">Nenhuma maquete</option>';
    return;
  }
  sel.innerHTML = list.map(m => `<option value="${m.id}">#${m.id} — ${m.nome || 'Sem nome'}</option>`).join('');
}

function cloudinaryImageUrl(publicId) {
  const cloudName = document.body?.dataset?.cloudinaryCloudName;
  if (!publicId || !cloudName) return '';
  return `https://res.cloudinary.com/${cloudName}/image/upload/${publicId}`;
}
// Adiciona geração de thumbs do Cloudinary com transformação
function cloudinaryThumbUrl(publicId, w = 100, h = 75) {
  const cloudName = document.body?.dataset?.cloudinaryCloudName;
  if (!publicId || !cloudName) return '';
  return `https://res.cloudinary.com/${cloudName}/image/upload/c_fill,w_${w},h_${h}/${publicId}`;
}

async function loadGaleriaForSelected() {
  const sel = document.getElementById('select-maquete-galeria');
  const listEl = document.getElementById('galeria-lista');
  if (!sel || !listEl) return;
  const mid = sel.value;
  if (!mid) { listEl.innerHTML = '<div class="muted">Selecione uma maquete</div>'; return; }
  try {
    const images = await fetchJSON(`/api/maquetes/${mid}/images`);
    renderGaleria(images, mid);
  } catch (err) {
    listEl.innerHTML = `<div class="muted">Erro: ${err.message}</div>`;
  }
}

function renderGaleria(images, mid) {
  const listEl = document.getElementById('galeria-lista');
  if (!listEl) return;
  if (!images || images.length === 0) { listEl.innerHTML = '<div class="muted">Sem imagens</div>'; return; }
  listEl.innerHTML = images.map(img => {
    const url = img.public_id ? cloudinaryThumbUrl(img.public_id, 220, 100) : (img.url || '');
    return `
      <div class="galeria-item" style="border:1px solid var(--line); padding:6px; border-radius:6px;">
        ${url ? `<img src="${url}" style="width:100%; height:100px; object-fit:cover; border-radius:4px;" loading="lazy" />` : '<div class="muted">Sem URL</div>'}
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
          <small>${img.public_id || ''}</small>
          <button class="danger" data-del-img="${img.id}" data-mid="${mid}">Remover</button>
        </div>
      </div>
    `;
  }).join('');
  // Bind delete
  listEl.querySelectorAll('[data-del-img]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const imageId = btn.getAttribute('data-del-img');
      const maqueteId = btn.getAttribute('data-mid');
      if (!confirm('Remover imagem #' + imageId + '?')) return;
      try {
        await fetchJSON(`/api/maquetes/${maqueteId}/images/${imageId}`, { method: 'DELETE' });
        await loadGaleriaForSelected();
      } catch (err) {
        alert('Erro ao remover: ' + err.message);
      }
    });
  });
}

async function uploadSecundariaAndCreate() {
  const cloudName = document.body?.dataset?.cloudinaryCloudName;
  const uploadPreset = document.body?.dataset?.cloudinaryUploadPreset;
  const fileInput = document.getElementById('file-imagem-secundaria');
  const sel = document.getElementById('select-maquete-galeria');
  if (!cloudName || !uploadPreset || !fileInput || !sel) return alert('Cloudinary não configurado ou inputs ausentes');
  const mid = sel.value;
  const file = fileInput.files[0];
  if (!mid) return alert('Selecione uma maquete');
  if (!file) return alert('Selecione uma imagem');
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', uploadPreset);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error(`Upload falhou (${res.status})`);
    const data = await res.json();
    const payload = { public_id: data.public_id || '', url: data.secure_url || '' };
    await fetchJSON(`/api/maquetes/${mid}/images`, { method: 'POST', body: JSON.stringify(payload) });
    fileInput.value = '';
    await loadGaleriaForSelected();
  } catch (err) {
    alert('Erro ao enviar/adicionar: ' + err.message);
  }
}

function bindGaleriaControls() {
  const sel = document.getElementById('select-maquete-galeria');
  const btnReload = document.getElementById('btn-recarregar-galeria');
  const btnAdd = document.getElementById('btn-adicionar-imagem');
  sel?.addEventListener('change', loadGaleriaForSelected);
  btnReload?.addEventListener('click', loadGaleriaForSelected);
  btnAdd?.addEventListener('click', uploadSecundariaAndCreate);
}

let cadastroSecundarias = [];

function renderCadastroSecundarias() {
  const container = document.getElementById('preview-secundarias');
  if (!container) return;
  if (cadastroSecundarias.length === 0) {
    container.innerHTML = '<div class="muted">Nenhuma imagem selecionada</div>';
    return;
  }
  const limit = 4;
  const itemsHtml = cadastroSecundarias.slice(0, limit).map((img, idx) => {
    const src = img.public_id ? cloudinaryThumbUrl(img.public_id, 110, 80) : (img.previewUrl || img.url || '');
    return `
      <div class="thumb-item" data-idx="${idx}">
        ${src ? `<img src="${src}" alt="">` : '<div class="muted">Sem preview</div>'}
        <div class="thumb-actions">
          <button type="button" class="btn danger small" data-remove="${idx}">Remover</button>
        </div>
      </div>
    `;
  }).join('');
  const extra = cadastroSecundarias.length - limit;
  container.innerHTML = itemsHtml + (extra > 0 ? `<div class="preview-contador">+ ${extra} foto${extra > 1 ? 's' : ''}</div>` : '');
  container.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.getAttribute('data-remove'), 10);
      if (!isNaN(i)) {
        cadastroSecundarias.splice(i, 1);
        renderCadastroSecundarias();
      }
    });
  });
}

function resetCadastroSecundarias() {
  cadastroSecundarias = [];
  const container = document.getElementById('preview-secundarias');
  if (container) container.innerHTML = '';
}

function setupCadastroSecundariasUpload() {
  const cloudName = document.body?.dataset?.cloudinaryCloudName;
  const uploadPreset = document.body?.dataset?.cloudinaryUploadPreset;
  const input = document.getElementById('file-imagens-secundarias');
  if (!input) return;
  input.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) {
      resetCadastroSecundarias();
      return;
    }
    const uploadPromises = [];
    for (const file of files) {
      const item = { fileName: file.name, previewUrl: '', public_id: '', url: '' };
      // Preview local imediato
      const reader = new FileReader();
      reader.onload = (ev) => {
        item.previewUrl = ev.target.result;
        renderCadastroSecundarias();
      };
      reader.readAsDataURL(file);
      cadastroSecundarias.push(item);
      // Upload para Cloudinary em paralelo, se configurado
      if (cloudName && uploadPreset) {
        const p = (async () => {
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
            item.public_id = data.public_id || '';
            item.url = data.secure_url || '';
            renderCadastroSecundarias();
          } catch (err) {
            console.error('Falha ao enviar imagem secundária:', err);
          }
        })();
        uploadPromises.push(p);
      }
    }
    // Não aguardar para não travar a UI; ainda assim pode ser útil observar conclusão:
    Promise.allSettled(uploadPromises).catch(() => {});
  });
}