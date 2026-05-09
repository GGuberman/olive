(function () {
  'use strict';

  var CONFIG_KEY = 'fig_config';
  var ACCOUNT_KEY = 'fig_account';
  var LLM_KEY = 'fig_llm';
  var LEGACY_PROVIDER = 'fig_provider';
  var LEGACY_KEY = 'fig_key';
  var SYNC_KEY = 'fig_sync';

  function lsGet(k, fallback) {
    try { var r = localStorage.getItem(k); return r ? JSON.parse(r) : (fallback || null); } catch (e) { return fallback || null; }
  }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  var FIG_PROVIDERS = [
    { id: 'anthropic',  name: 'Claude',      desc: 'Anthropic · direct from browser',         keyPlaceholder: 'sk-ant-...', defaultBase: 'https://api.anthropic.com',           keyHelp: '<a href="https://console.anthropic.com/settings/keys" target="_blank">Get a key →</a>' },
    { id: 'openrouter', name: 'OpenRouter',  desc: '~80 models, one key (browser-friendly)',  keyPlaceholder: 'sk-...',      defaultBase: 'https://openrouter.ai/api',           keyHelp: '<a href="https://openrouter.ai/keys" target="_blank">Get a key →</a>' },
    { id: 'openai',     name: 'GPT',         desc: 'OpenAI · needs proxy (no browser CORS)',  keyPlaceholder: 'sk-...',      defaultBase: 'https://api.openai.com',              keyHelp: 'OpenAI blocks direct browser calls. Set Base URL to your own proxy/gateway. <a href="https://platform.openai.com/api-keys" target="_blank">Get a key →</a>' },
    { id: 'ollama',     name: 'Ollama',      desc: 'Local · runs on your machine',            keyPlaceholder: '(no key needed)', defaultBase: 'http://localhost:11434',            keyHelp: '<a href="https://ollama.com/download" target="_blank">Install Ollama →</a> then run <code>OLLAMA_ORIGINS="*" ollama serve</code>' },
    { id: 'gemini',     name: 'Gemini',      desc: 'Google Gemini',                            keyPlaceholder: 'AIza...',     defaultBase: 'https://generativelanguage.googleapis.com', keyHelp: '<a href="https://aistudio.google.com/apikey" target="_blank">Get a key →</a>' },
    { id: 'deepseek',   name: 'DeepSeek',    desc: 'DeepSeek chat models',                     keyPlaceholder: 'sk-...',      defaultBase: 'https://api.deepseek.com',            keyHelp: '<a href="https://platform.deepseek.com/api_keys" target="_blank">Get a key →</a>' },
  ];

  function figGetProvider(id) {
    return FIG_PROVIDERS.find(function (p) { return p.id === id; }) || FIG_PROVIDERS[0];
  }

  function figGetConfig() {
    var cfg = lsGet(CONFIG_KEY);
    if (!cfg) cfg = {};
    if (!cfg.identity && lsGet(ACCOUNT_KEY)) cfg.identity = lsGet(ACCOUNT_KEY);
    if (!cfg.llm && lsGet(LLM_KEY)) cfg.llm = lsGet(LLM_KEY);
    if (!cfg.llm && lsGet(LEGACY_PROVIDER)) cfg.llm = { provider: lsGet(LEGACY_PROVIDER), key: lsGet(LEGACY_KEY), baseUrl: figGetProvider(lsGet(LEGACY_PROVIDER)).defaultBase };
    return cfg;
  }

  function figSetConfig(cfg) {
    lsSet(CONFIG_KEY, cfg);
    if (cfg.identity) lsSet(ACCOUNT_KEY, cfg.identity);
    if (cfg.llm) {
      lsSet(LLM_KEY, cfg.llm);
      lsSet(LEGACY_PROVIDER, cfg.llm.provider);
      if (cfg.llm.key) lsSet(LEGACY_KEY, cfg.llm.key);
    }
  }

  function figGetSync() { return lsGet(SYNC_KEY) || {}; }
  function figSetSync(s) { lsSet(SYNC_KEY, s); }

  function figClearLLM() {
    lsDel(LLM_KEY); lsDel(LEGACY_PROVIDER); lsDel(LEGACY_KEY);
    var cfg = figGetConfig();
    if (cfg.llm) delete cfg.llm;
    lsSet(CONFIG_KEY, cfg);
  }

  async function figTestLLM(llm) {
    var provider = llm.provider || 'anthropic';
    var key = llm.key;
    var baseUrl = llm.baseUrl || figGetProvider(provider).defaultBase;
    if (provider === 'ollama') {
      var r = await fetch((baseUrl || 'http://localhost:11434') + '/api/tags');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var d = await r.json();
      return 'Ollama up · ' + (d.models ? d.models.length : 0) + ' models.';
    } else if (provider === 'anthropic') {
      var r = await fetch((baseUrl || 'https://api.anthropic.com') + '/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] })
      });
      if (!r.ok) { var e = await r.json().catch(function () { return {}; }); throw new Error((e.error && e.error.message) || 'HTTP ' + r.status); }
      return 'Anthropic OK.';
    } else if (provider === 'openai') {
      var r = await fetch((baseUrl || 'https://api.openai.com') + '/v1/models', { headers: { 'Authorization': 'Bearer ' + key } });
      if (!r.ok) { var e = await r.json().catch(function () { return {}; }); throw new Error((e.error && e.error.message) || 'HTTP ' + r.status); }
      return 'OpenAI OK.';
    } else if (provider === 'openrouter') {
      var r = await fetch((baseUrl || 'https://openrouter.ai/api') + '/v1/models', { headers: { 'Authorization': 'Bearer ' + key } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var d = await r.json();
      return 'OpenRouter OK · ' + (d.data ? d.data.length : '?') + ' models.';
    } else if (provider === 'gemini') {
      var r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + key, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'hi' }] }] }) });
      if (!r.ok) { var e = await r.json().catch(function () { return {}; }); throw new Error((e.error && e.error.message) || 'HTTP ' + r.status); }
      return 'Gemini OK.';
    } else if (provider === 'deepseek') {
      var r = await fetch((baseUrl || 'https://api.deepseek.com') + '/v1/models', { headers: { 'Authorization': 'Bearer ' + key } });
      if (!r.ok) { var e = await r.json().catch(function () { return {}; }); throw new Error((e.error && e.error.message) || 'HTTP ' + r.status); }
      return 'DeepSeek OK.';
    }
    throw new Error('Unknown provider: ' + provider);
  }

  async function figCallLLM(systemPrompt, userMessage, expectJSON, llmOverride) {
    var cfg = figGetConfig();
    var llm = llmOverride || cfg.llm || {};
    var provider = llm.provider || 'anthropic';
    var key = llm.key;
    var baseUrl = llm.baseUrl || figGetProvider(provider).defaultBase;
    if (!key && provider !== 'ollama') throw new Error('No API key configured. Set one in Settings → LLM.');
    var content = '';
    if (provider === 'anthropic') {
      var r = await fetch((baseUrl || 'https://api.anthropic.com') + '/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: 'claude-3-5-haiku-20241022', max_tokens: 2048, system: systemPrompt, messages: [{ role: 'user', content: userMessage }] })
      });
      var d = await r.json();
      if (d.error) throw new Error(d.error.message);
      content = d.content ? d.content[0].text : '';
    } else if (provider === 'openai' || provider === 'deepseek') {
      var model = provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o-mini';
      var url = (baseUrl || figGetProvider(provider).defaultBase) + '/chat/completions';
      var r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body: JSON.stringify({ model: model, max_tokens: 2048, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }] }) });
      var d = await r.json();
      if (d.error) throw new Error(d.error.message);
      content = d.choices ? d.choices[0].message.content : '';
    } else if (provider === 'gemini') {
      var r = await fetch((baseUrl || 'https://generativelanguage.googleapis.com') + '/v1beta/models/gemini-1.5-flash:generateContent?key=' + key, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: systemPrompt + '\n\n' + userMessage }] }] }) });
      var d = await r.json();
      if (d.error) throw new Error(d.error.message);
      content = d.candidates ? d.candidates[0].content.parts[0].text : '';
    } else if (provider === 'ollama') {
      var r = await fetch((baseUrl || 'http://localhost:11434') + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'llama3.2', stream: false, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }] }) });
      var d = await r.json();
      content = d.message ? d.message.content : '';
    } else if (provider === 'openrouter') {
      var r = await fetch((baseUrl || 'https://openrouter.ai/api') + '/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body: JSON.stringify({ model: 'openai/gpt-4o-mini', max_tokens: 2048, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }] }) });
      var d = await r.json();
      if (d.error) throw new Error(d.error.message);
      content = d.choices ? d.choices[0].message.content : '';
    }
    if (expectJSON) {
      content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(content);
    }
    return content;
  }

  var THEME_KEY = 'fig_theme_v1';
  var FIG_PRESETS = [
    { name: 'Fig Dark',      bg: '#0a0a0f', surface: '#12121a', surface2: '#1a1a26', border: '#252535', accent: '#9b7fe8', accent2: '#c4aaff', text: '#e8e4f0', muted: '#6b6880' },
    { name: 'Fig Light',     bg: '#f5f7f2', surface: '#ffffff', surface2: '#eef2e8', border: '#d8e0d0', accent: '#2f7d4a', accent2: '#4a9d6a', text: '#1a2e1d', muted: '#5a6a52' },
    { name: 'Midnight Gold', bg: '#0e0e0f', surface: '#161618', surface2: '#1e1e21', border: '#2a2a2e', accent: '#c9a96e', accent2: '#e8c98a', text: '#e8e4dc', muted: '#7a7870' },
    { name: 'Forest',        bg: '#0a0f0b', surface: '#121a13', surface2: '#1a2620', border: '#253528', accent: '#7ec8a0', accent2: '#a8e4c0', text: '#e0ede4', muted: '#6a8070' },
    { name: 'Slate',         bg: '#0d0f14', surface: '#14161e', surface2: '#1c2030', border: '#282c3e', accent: '#8ab4e8', accent2: '#aad0ff', text: '#dde4f0', muted: '#6878a0' },
    { name: 'Rose',          bg: '#0f0a0d', surface: '#1a1018', surface2: '#261828', border: '#362030', accent: '#e88ab4', accent2: '#ffaad0', text: '#f0dde8', muted: '#907080' },
  ];
  var FIG_DEFS = FIG_PRESETS[0];

  function figLoadTheme() {
    try { var s = localStorage.getItem(THEME_KEY); return s ? Object.assign({}, FIG_DEFS, JSON.parse(s)) : Object.assign({}, FIG_DEFS); } catch (e) { return Object.assign({}, FIG_DEFS); }
  }

  function figApplyTheme(t) {
    var r = document.documentElement;
    Object.keys(t).forEach(function (k) { if (k !== 'name' && typeof t[k] === 'string') r.style.setProperty('--' + k, t[k]); });
    r.style.setProperty('--accent-dim', t.accent + '22');
    r.style.setProperty('--accent-mid', t.accent + '44');
    try { localStorage.setItem(THEME_KEY, JSON.stringify(t)); } catch (e) {}
  }

  window.FIG_PROVIDERS = FIG_PROVIDERS;
  window.figGetProvider = figGetProvider;
  window.figGetConfig = figGetConfig;
  window.figSetConfig = figSetConfig;
  window.figGetSync = figGetSync;
  window.figSetSync = figSetSync;
  window.figClearLLM = figClearLLM;
  window.figTestLLM = figTestLLM;
  window.figCallLLM = figCallLLM;
  window.figLoadTheme = figLoadTheme;
  window.figApplyTheme = figApplyTheme;
  window.FIG_PRESETS = FIG_PRESETS;
  window.FIG_DEFS = FIG_DEFS;
  window.THEME_KEY = THEME_KEY;
})();
