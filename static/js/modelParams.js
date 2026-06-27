/**
 * modelParams.js
 * Modal UI for granular model parameter configuration (Temperature, Top P, etc.)
 */
(function(exports) {
    var modal, content, closeBtn;
    var currentEndpointId = null;
    var currentModelId = null;
    
    // Will be populated from /api/model-endpoints/.../parameters
    var schema = {};
    
    function initUI() {
      if (modal) return;
      modal = document.createElement('div');
      modal.className = 'modal hidden';
      modal.style.zIndex = '10002'; // Above settings modal
      
      var modalContent = document.createElement('div');
      modalContent.className = 'modal-content settings-modal-content';
      modalContent.style.maxWidth = '600px';
      
      var header = document.createElement('div');
      header.className = 'modal-header';
      header.innerHTML = '<h4 id="model-params-title"><span style="vertical-align:-1px;margin-right:6px;font-size:15px">&#x2699;</span>Parameters</h4>';
      
      closeBtn = document.createElement('button');
      closeBtn.className = 'close-btn';
      closeBtn.textContent = '✖';
      closeBtn.onclick = hide;
      header.appendChild(closeBtn);
      
      content = document.createElement('div');
      content.className = 'modal-body';
      content.style.padding = '1.5rem';
      content.style.display = 'flex';
      content.style.flexDirection = 'column';
      content.style.gap = '1.2rem';
      
      modalContent.appendChild(header);
      modalContent.appendChild(content);
      modal.appendChild(modalContent);
      document.body.appendChild(modal);
      
      modal.addEventListener('click', function(e) {
        if (e.target === modal) hide();
      });
    }
    
    function hide() {
      if (modal) modal.classList.add('hidden');
    }
    
    function createControl(def, currentValue, globalDefault) {
      var row = document.createElement('div');
      row.className = 'settings-row';
      row.style.flexDirection = 'column';
      row.style.alignItems = 'flex-start';
      row.style.gap = '0.5rem';
      
      var header = document.createElement('div');
      header.style.display = 'flex';
      header.style.justifyContent = 'space-between';
      header.style.width = '100%';
      
      var label = document.createElement('label');
      label.className = 'settings-label';
      label.textContent = def.display_name;
      
      var desc = document.createElement('div');
      desc.style.fontSize = '0.75rem';
      desc.style.opacity = '0.6';
      desc.textContent = def.description;
      
      header.appendChild(label);
      
      row.appendChild(header);
      row.appendChild(desc);
      
      var inputWrap = document.createElement('div');
      inputWrap.style.display = 'flex';
      inputWrap.style.alignItems = 'center';
      inputWrap.style.gap = '1rem';
      inputWrap.style.width = '100%';
      
      var val = currentValue !== undefined && currentValue !== null && currentValue !== "" ? currentValue : "";
      
      var placeholderStr = "System Default: " + def.default;
      if (globalDefault !== undefined && globalDefault !== null) {
          placeholderStr = "Global Default: " + globalDefault;
      }
      
      if (def.type === 'float' || def.type === 'int') {
        var input = document.createElement('input');
        input.type = 'number';
        input.className = 'settings-input';
        input.style.width = '120px';
        input.dataset.param = def.name;
        if (def.min_val !== null) input.min = def.min_val;
        if (def.max_val !== null) input.max = def.max_val;
        if (def.step !== null) input.step = def.step;
        input.placeholder = placeholderStr;
        input.value = val;
        
        var slider = document.createElement('input');
        slider.type = 'range';
        slider.style.flex = '1';
        if (def.min_val !== null) slider.min = def.min_val;
        if (def.max_val !== null) slider.max = def.max_val;
        if (def.step !== null) slider.step = def.step;
        
        // If empty, sync slider to the fallback default
        slider.value = val !== "" ? val : (globalDefault !== undefined ? globalDefault : def.default);
        
        slider.oninput = function() { input.value = slider.value; };
        input.oninput = function() { slider.value = input.value; };
        
        inputWrap.appendChild(slider);
        inputWrap.appendChild(input);
      } else if (def.type === 'string') {
        var textarea = document.createElement('textarea');
        textarea.className = 'settings-input';
        textarea.style.width = '100%';
        textarea.style.height = '60px';
        textarea.style.resize = 'vertical';
        textarea.dataset.param = def.name;
        textarea.placeholder = placeholderStr;
        textarea.value = val;
        inputWrap.appendChild(textarea);
      }
      
      row.appendChild(inputWrap);
      return row;
    }
    
    async function showGlobalDefaults() {
      initUI();
      currentEndpointId = null;
      currentModelId = null;
      document.getElementById('model-params-title').innerHTML = '<span style="vertical-align:-1px;margin-right:6px;font-size:15px">&#x2699;</span>Global AI Parameters';
      
      content.innerHTML = '<div style="text-align:center;padding:2rem">Loading...</div>';
      modal.classList.remove('hidden');
      
      try {
        var res = await fetch('/api/model-endpoints/dummy/models/dummy/parameters', { credentials: 'same-origin' });
        var data = await res.json();
        schema = data.schema;
        renderForm(data.global_defaults || {}, {}, true);
      } catch (e) {
        content.innerHTML = '<div style="color:var(--red)">Failed to load parameters</div>';
      }
    }
    
    async function showModelParams(epId, modelId) {
      initUI();
      currentEndpointId = epId;
      currentModelId = modelId;
      document.getElementById('model-params-title').innerHTML = '<span style="vertical-align:-1px;margin-right:6px;font-size:15px">&#x2699;</span>' + modelId + ' Parameters';
      
      content.innerHTML = '<div style="text-align:center;padding:2rem">Loading...</div>';
      modal.classList.remove('hidden');
      
      try {
        var res = await fetch('/api/model-endpoints/' + encodeURIComponent(epId) + '/models/' + encodeURIComponent(modelId).replace(/%2F/g, '/') + '/parameters', { credentials: 'same-origin' });
        var data = await res.json();
        schema = data.schema;
        renderForm(data.parameters || {}, data.global_defaults || {}, false);
      } catch (e) {
        content.innerHTML = '<div style="color:var(--red)">Failed to load parameters</div>';
      }
    }
    
    function renderForm(params, globalDefaults, isGlobal) {
      content.innerHTML = '';
      
      if (!isGlobal) {
          var help = document.createElement('div');
          help.style.marginBottom = '1rem';
          help.style.fontSize = '0.85rem';
          help.style.opacity = '0.8';
          help.textContent = 'Overrides for this specific model. Leave blank to inherit global or system defaults.';
          content.appendChild(help);
      }
      
      var form = document.createElement('form');
      form.onsubmit = async function(e) {
        e.preventDefault();
        save(form, isGlobal);
      };
      
      Object.keys(schema).forEach(function(k) {
        var def = schema[k];
        form.appendChild(createControl(def, params[k], globalDefaults[k]));
      });
      
      var actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.justifyContent = 'flex-end';
      actions.style.gap = '0.5rem';
      actions.style.marginTop = '1rem';
      
      var msg = document.createElement('span');
      msg.className = 'status-msg';
      msg.style.alignSelf = 'center';
      msg.style.marginRight = 'auto';
      msg.style.fontSize = '0.85rem';
      
      var saveBtn = document.createElement('button');
      saveBtn.type = 'submit';
      saveBtn.className = 'form-btn';
      saveBtn.textContent = 'Save Parameters';
      
      actions.appendChild(msg);
      actions.appendChild(saveBtn);
      form.appendChild(actions);
      
      content.appendChild(form);
    }
    
    async function save(form, isGlobal) {
      var inputs = form.querySelectorAll('[data-param]');
      var data = {};
      inputs.forEach(function(inp) {
        var val = inp.value;
        if (val.trim() !== '') {
          if (inp.type === 'number') val = parseFloat(val);
          data[inp.dataset.param] = val;
        }
      });
      
      var btn = form.querySelector('button[type="submit"]');
      var msg = form.querySelector('.status-msg');
      btn.disabled = true;
      msg.textContent = 'Saving...';
      msg.style.color = 'var(--fg)';
      
      try {
        var url = isGlobal 
          ? '/api/model-parameters/global-defaults' 
          : '/api/model-endpoints/' + encodeURIComponent(currentEndpointId) + '/models/' + encodeURIComponent(currentModelId).replace(/%2F/g, '/') + '/parameters';
          
        var res = await fetch(url, {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        
        if (res.ok) {
          msg.textContent = 'Saved successfully';
          msg.style.color = 'var(--green)';
          setTimeout(hide, 1000);
        } else {
          throw new Error('Failed');
        }
      } catch (e) {
        msg.textContent = 'Failed to save parameters';
        msg.style.color = 'var(--red)';
        btn.disabled = false;
      }
    }
    
    exports.odysseusModelParams = {
      showGlobalDefaults: showGlobalDefaults,
      showModelParams: showModelParams
    };
})(window);
