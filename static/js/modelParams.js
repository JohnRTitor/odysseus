import uiModule from './ui.js';

let modalEl = null;

function _createModal() {
  if (modalEl) return modalEl;
  modalEl = document.createElement('div');
  modalEl.id = 'model-params-modal';
  modalEl.className = 'modal hidden';
  modalEl.innerHTML = `
    <div class="modal-content" role="dialog" aria-label="Model Parameters" style="width: 550px; max-width: 95vw; background: var(--bg);">
      <div class="modal-header">
        <h3 id="model-params-title" style="margin: 0; font-size: 16px;">Model Parameters</h3>
        <button class="close-btn" id="close-model-params" aria-label="Close">✖</button>
      </div>
      <div class="modal-body" style="max-height: 65vh; overflow-y: auto; padding-right: 12px;">
        <div id="model-params-loading" style="display: none; opacity: 0.5; font-size: 12px; padding: 20px; text-align: center;">Loading parameters...</div>
        <div id="model-params-error" class="admin-error" style="display: none; margin-bottom: 12px;"></div>
        <div id="model-params-form" style="display: flex; flex-direction: column; gap: 16px;">
          <!-- dynamic fields -->
        </div>
      </div>
      <div class="modal-footer" style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border); padding-top: 16px; margin-top: 16px;">
        <button type="button" class="admin-btn-delete" id="clear-model-params">Reset to Defaults</button>
        <div style="display: flex; gap: 8px;">
          <button type="button" class="admin-btn-sm" id="cancel-model-params">Cancel</button>
          <button type="button" class="admin-btn-sm" id="save-model-params" style="background: var(--accent); color: white; border-color: var(--accent);">Save Parameters</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modalEl);

  modalEl.querySelector('#close-model-params').addEventListener('click', hideModal);
  modalEl.querySelector('#cancel-model-params').addEventListener('click', hideModal);
  
  // Close on outside click
  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl) hideModal();
  });

  return modalEl;
}

export function hideModal() {
  if (modalEl) {
    modalEl.classList.add('hidden');
  }
}

function renderField(def, value, globalDefault) {
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.gap = '4px';

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'baseline';

  const label = document.createElement('label');
  label.textContent = def.display_name || def.name;
  label.style.fontWeight = '600';
  label.style.fontSize = '12px';

  const defaultHint = document.createElement('span');
  defaultHint.style.fontSize = '10px';
  defaultHint.style.opacity = '0.5';
  let hintText = '';
  if (globalDefault !== undefined && globalDefault !== null) {
      hintText = `Global: ${globalDefault}`;
  } else if (def.default !== undefined && def.default !== null) {
      hintText = `Default: ${def.default}`;
  }
  defaultHint.textContent = hintText;

  header.appendChild(label);
  header.appendChild(defaultHint);

  const desc = document.createElement('div');
  desc.textContent = def.description;
  desc.style.fontSize = '11px';
  desc.style.opacity = '0.6';
  desc.style.marginBottom = '4px';

  let input;
  if (def.type === 'boolean') {
    input = document.createElement('select');
    input.innerHTML = `
      <option value="">(Inherit default)</option>
      <option value="true">True</option>
      <option value="false">False</option>
    `;
    if (value === true) input.value = "true";
    else if (value === false) input.value = "false";
    else input.value = "";
    input.dataset.paramName = def.name;
    input.dataset.paramType = 'boolean';
    input.style.width = '100%';
    input.style.background = 'var(--bg)';
    input.style.border = '1px solid var(--border)';
    input.style.color = 'var(--fg)';
    input.style.borderRadius = '4px';
    input.style.padding = '6px 8px';
    input.style.fontFamily = 'inherit';
  } else if (def.type === 'string' && def.name === 'system_prompt') {
    input = document.createElement('textarea');
    input.placeholder = "(Inherit default)";
    input.value = value !== undefined && value !== null ? value : '';
    input.dataset.paramName = def.name;
    input.dataset.paramType = 'string';
    input.style.width = '100%';
    input.style.minHeight = '100px';
    input.style.background = 'var(--bg)';
    input.style.border = '1px solid var(--border)';
    input.style.color = 'var(--fg)';
    input.style.borderRadius = '4px';
    input.style.padding = '8px';
    input.style.fontFamily = 'inherit';
    input.style.resize = 'vertical';
  } else {
    input = document.createElement('input');
    input.type = 'number';
    input.placeholder = "(Inherit default)";
    if (def.type === 'float') {
        input.step = def.step !== undefined ? def.step : 0.1;
    } else {
        input.step = def.step !== undefined ? def.step : 1;
    }
    if (def.min_val !== undefined && def.min_val !== null) input.min = def.min_val;
    if (def.max_val !== undefined && def.max_val !== null) input.max = def.max_val;
    
    input.value = value !== undefined && value !== null ? value : '';
    input.dataset.paramName = def.name;
    input.dataset.paramType = def.type;
    input.style.width = '100%';
    input.style.background = 'var(--bg)';
    input.style.border = '1px solid var(--border)';
    input.style.color = 'var(--fg)';
    input.style.borderRadius = '4px';
    input.style.padding = '6px 8px';
    input.style.fontFamily = 'inherit';
  }

  wrapper.appendChild(header);
  wrapper.appendChild(desc);
  wrapper.appendChild(input);

  return wrapper;
}

export async function showModelParamsModal(epId, modelId, modelDisplay) {
  const modal = _createModal();
  modal.querySelector('#model-params-title').textContent = `Parameters: ${modelDisplay}`;
  
  const formBox = modal.querySelector('#model-params-form');
  const loadingBox = modal.querySelector('#model-params-loading');
  const errorBox = modal.querySelector('#model-params-error');
  const saveBtn = modal.querySelector('#save-model-params');
  const clearBtn = modal.querySelector('#clear-model-params');
  
  formBox.innerHTML = '';
  errorBox.style.display = 'none';
  loadingBox.style.display = 'block';
  saveBtn.disabled = true;
  clearBtn.disabled = true;
  modal.classList.remove('hidden');

  let currentParams = {};
  let schemaDefs = {};
  let globalDefaults = {};

  try {
    const res = await fetch(`/api/model-endpoints/${epId}/models/${encodeURIComponent(modelId)}/parameters`, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    currentParams = data.parameters || {};
    schemaDefs = data.schema || {};
    globalDefaults = data.global_defaults || {};
  } catch (err) {
    loadingBox.style.display = 'none';
    errorBox.textContent = `Failed to load parameters: ${err.message}`;
    errorBox.style.display = 'block';
    return;
  }

  loadingBox.style.display = 'none';
  saveBtn.disabled = false;
  clearBtn.disabled = false;

  const defs = Object.values(schemaDefs);
  if (defs.length === 0) {
    formBox.innerHTML = '<div style="opacity: 0.5; font-size: 12px;">No configurable parameters available.</div>';
  } else {
    defs.forEach(def => {
      const val = currentParams[def.name];
      const globDef = globalDefaults[def.name];
      formBox.appendChild(renderField(def, val, globDef));
    });
  }

  // Handle Save
  const _handleSave = async () => {
    saveBtn.disabled = true;
    const oldText = saveBtn.textContent;
    saveBtn.textContent = 'Saving...';
    
    const payload = {};
    formBox.querySelectorAll('input, textarea, select').forEach(input => {
      const name = input.dataset.paramName;
      const type = input.dataset.paramType;
      if (!name) return;

      const val = input.value.trim();
      if (val === '') return; // omit empty (unset)

      if (type === 'boolean') {
        payload[name] = val === 'true';
      } else if (type === 'float') {
        if (!isNaN(parseFloat(val))) payload[name] = parseFloat(val);
      } else if (type === 'int') {
        if (!isNaN(parseInt(val, 10))) payload[name] = parseInt(val, 10);
      } else {
        payload[name] = input.value; // For strings, we might want to keep spaces, so use raw input.value instead of trim(), but we already trimmed for the empty check. Let's use raw value.
      }
      if (type === 'string' && input.value !== '') {
          payload[name] = input.value;
      }
    });

    try {
      const res = await fetch(`/api/model-endpoints/${epId}/models/${encodeURIComponent(modelId)}/parameters`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      uiModule.showToast('Model parameters saved');
      hideModal();
    } catch (err) {
      errorBox.textContent = `Save failed: ${err.message}`;
      errorBox.style.display = 'block';
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = oldText;
    }
  };

  // Handle Clear
  const _handleClear = async () => {
    if (!await uiModule.styledConfirm('Are you sure you want to clear all custom parameters for this model?', { confirmText: 'Clear', danger: true })) {
      return;
    }
    clearBtn.disabled = true;
    try {
      const res = await fetch(`/api/model-endpoints/${epId}/models/${encodeURIComponent(modelId)}/parameters`, {
        method: 'DELETE',
        credentials: 'same-origin'
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      uiModule.showToast('Parameters cleared');
      hideModal();
    } catch (err) {
      errorBox.textContent = `Clear failed: ${err.message}`;
      errorBox.style.display = 'block';
      clearBtn.disabled = false;
    }
  };

  // Clear previous listeners by replacing elements or maintaining singletons.
  // The simplest is to replace the button clone.
  const newSaveBtn = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
  newSaveBtn.addEventListener('click', _handleSave);

  const newClearBtn = clearBtn.cloneNode(true);
  clearBtn.parentNode.replaceChild(newClearBtn, clearBtn);
  newClearBtn.addEventListener('click', _handleClear);
}

export async function showGlobalParamsModal() {
  const modal = _createModal();
  modal.querySelector('#model-params-title').textContent = `Global AI Defaults`;
  
  const formBox = modal.querySelector('#model-params-form');
  const loadingBox = modal.querySelector('#model-params-loading');
  const errorBox = modal.querySelector('#model-params-error');
  const saveBtn = modal.querySelector('#save-model-params');
  const clearBtn = modal.querySelector('#clear-model-params');
  
  formBox.innerHTML = '';
  errorBox.style.display = 'none';
  loadingBox.style.display = 'block';
  saveBtn.disabled = true;
  clearBtn.style.display = 'none'; // No clear for globals
  modal.classList.remove('hidden');

  let currentParams = {};
  let schemaDefs = {};

  try {
    const res = await fetch(`/api/model-parameters/global-defaults`, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    currentParams = data.parameters || {};
    schemaDefs = data.schema || {};
  } catch (err) {
    loadingBox.style.display = 'none';
    errorBox.textContent = `Failed to load global parameters: ${err.message}`;
    errorBox.style.display = 'block';
    return;
  }

  loadingBox.style.display = 'none';
  saveBtn.disabled = false;

  const defs = Object.values(schemaDefs);
  if (defs.length === 0) {
    formBox.innerHTML = '<div style="opacity: 0.5; font-size: 12px;">No configurable parameters available.</div>';
  } else {
    defs.forEach(def => {
      const val = currentParams[def.name];
      formBox.appendChild(renderField(def, val, def.default));
    });
  }

  // Handle Save
  const _handleSave = async () => {
    saveBtn.disabled = true;
    const oldText = saveBtn.textContent;
    saveBtn.textContent = 'Saving...';
    
    const payload = {};
    formBox.querySelectorAll('input, textarea, select').forEach(input => {
      const name = input.dataset.paramName;
      const type = input.dataset.paramType;
      if (!name) return;

      const val = input.value.trim();
      if (val === '') return; // omit empty (unset)

      if (type === 'boolean') {
        payload[name] = val === 'true';
      } else if (type === 'float') {
        if (!isNaN(parseFloat(val))) payload[name] = parseFloat(val);
      } else if (type === 'int') {
        if (!isNaN(parseInt(val, 10))) payload[name] = parseInt(val, 10);
      } else {
        payload[name] = input.value;
      }
      if (type === 'string' && input.value !== '') {
          payload[name] = input.value;
      }
    });

    try {
      const res = await fetch(`/api/model-parameters/global-defaults`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      uiModule.showToast('Global defaults saved');
      hideModal();
    } catch (err) {
      errorBox.textContent = `Save failed: ${err.message}`;
      errorBox.style.display = 'block';
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = oldText;
    }
  };

  const newSaveBtn = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
  newSaveBtn.addEventListener('click', _handleSave);
}

const modelParamsModule = { showModelParamsModal, showGlobalParamsModal, hideModal };
export default modelParamsModule;
