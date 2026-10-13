/**
 * CAI - Interactive AI Chatbot Interface
 * Complete JavaScript Engine: Chat State, LocalStorage Persistence,
 * File & Photo Uploads, Markdown & Code Rendering, Simulated & Live API Ready
 */

(function () {
  'use strict';

  // =========================================================================
  // 1. Storage Keys & Initial State
  // =========================================================================
  const STORAGE_KEYS = {
    CHATS: 'cai_conversations_v1',
    ACTIVE_CHAT: 'cai_active_chat_id_v1',
    SETTINGS: 'cai_settings_v1',
    THEME: 'cai_theme_v1'
  };

  const DEFAULT_SETTINGS = {
    provider: 'gemini',
    apiKey: 'AQ.Ab8RN6KoHuNmfdw2wH4IHjeKSpofil9lW_lsPRbRR4z8dR227A',
    model: 'gemini-flash-lite-latest',
    endpoint: '',
    systemPrompt: 'You are CAI, a helpful, brilliant, and precise personal AI assistant. Format your replies with clean, well-structured markdown.',
    userName: 'User'
  };

  // Application State
  const state = {
    chats: [],
    activeChatId: null,
    pendingAttachments: [],
    settings: { ...DEFAULT_SETTINGS },
    theme: 'dark',
    isGenerating: false,
    abortController: null,
    currentlySpeakingUtterance: null
  };

  // =========================================================================
  // 2. DOM Elements Cache
  // =========================================================================
  const DOM = {
    app: document.getElementById('app'),
    sidebar: document.getElementById('sidebar'),
    sidebarBackdrop: document.getElementById('sidebarBackdrop'),
    collapseSidebarBtn: document.getElementById('collapseSidebarBtn'),
    openSidebarBtn: document.getElementById('openSidebarBtn'),
    newChatBtn: document.getElementById('newChatBtn'),
    mobileNewChatBtn: document.getElementById('mobileNewChatBtn'),
    searchChatsInput: document.getElementById('searchChatsInput'),
    chatList: document.getElementById('chatList'),
    topChatTitle: document.getElementById('topChatTitle'),
    clearChatBtn: document.getElementById('clearChatBtn'),
    modelBadge: document.getElementById('modelBadge'),
    currentModelLabel: document.getElementById('currentModelLabel'),
    currentModelTag: document.getElementById('currentModelTag'),
    modelStatusIndicator: document.getElementById('modelStatusIndicator'),
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    messagesContainer: document.getElementById('messagesContainer'),
    welcomeHero: document.getElementById('welcomeHero'),
    messagesList: document.getElementById('messagesList'),
    scrollToBottomBtn: document.getElementById('scrollToBottomBtn'),
    attachmentPreviewRack: document.getElementById('attachmentPreviewRack'),
    fileInput: document.getElementById('fileInput'),
    attachBtn: document.getElementById('attachBtn'),
    chatInput: document.getElementById('chatInput'),
    sendBtn: document.getElementById('sendBtn'),
    dragDropOverlay: document.getElementById('dragDropOverlay'),
    toast: document.getElementById('toast'),

    // Settings Modal
    settingsBtn: document.getElementById('settingsBtn'),
    settingsModal: document.getElementById('settingsModal'),
    settingsBackdrop: document.getElementById('settingsBackdrop'),
    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
    cancelSettingsBtn: document.getElementById('cancelSettingsBtn'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
    apiProviderSelect: document.getElementById('apiProviderSelect'),
    apiKeyInput: document.getElementById('apiKeyInput'),
    toggleApiKeyVisibility: document.getElementById('toggleApiKeyVisibility'),
    apiModelInput: document.getElementById('apiModelInput'),
    apiEndpointInput: document.getElementById('apiEndpointInput'),
    systemPromptInput: document.getElementById('systemPromptInput'),
    userNameInput: document.getElementById('userNameInput'),
    exportChatsBtn: document.getElementById('exportChatsBtn'),
    clearAllChatsBtn: document.getElementById('clearAllChatsBtn'),

    // Lightbox Modal
    imageLightboxModal: document.getElementById('imageLightboxModal'),
    lightboxBackdrop: document.getElementById('lightboxBackdrop'),
    closeLightboxBtn: document.getElementById('closeLightboxBtn'),
    lightboxImage: document.getElementById('lightboxImage'),
    lightboxFilename: document.getElementById('lightboxFilename'),
    lightboxDownloadBtn: document.getElementById('lightboxDownloadBtn')
  };

  // =========================================================================
  // 3. Helper Utilities
  // =========================================================================
  function generateId(prefix = 'cai') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 7)}`;
  }

  function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  let toastTimeout = null;
  function showToast(message, duration = 3000) {
    if (!DOM.toast) return;
    DOM.toast.textContent = message;
    DOM.toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      DOM.toast.classList.remove('show');
    }, duration);
  }

  // Compress & downscale image if necessary to preserve localStorage quota
  async function processImageFile(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1200;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL(file.type || 'image/jpeg', 0.85);
          resolve(compressedDataUrl);
        };
        img.onerror = () => resolve(e.target.result);
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // =========================================================================
  // 4. Markdown & Syntax Highlighter Parser
  // =========================================================================
  function parseMarkdown(text) {
    if (!text) return '';

    // Extract and preserve code blocks
    const codeBlocks = [];
    let processed = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
      codeBlocks.push({ lang: lang || 'code', code: code.trim() });
      return placeholder;
    });

    // Escape HTML in prose
    processed = escapeHtml(processed);

    // Headers
    processed = processed.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    processed = processed.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    processed = processed.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Blockquotes
    processed = processed.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>');

    // Bold & Italics
    processed = processed.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
    processed = processed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    processed = processed.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Inline Code
    processed = processed.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Links: [text](url)
    processed = processed.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // Markdown Tables
    processed = processed.replace(/(\|[^\n]+\|\r?\n)((?:\|[^\n]+\|\r?\n?)+)/g, (fullMatch) => {
      const lines = fullMatch.trim().split('\n').filter(Boolean);
      if (lines.length < 2) return fullMatch;
      let html = '<table>';
      lines.forEach((line, index) => {
        // Skip separator line |---|---|
        if (index === 1 && line.includes('---')) return;
        const cols = line.split('|').slice(1, -1);
        const tag = index === 0 ? 'th' : 'td';
        html += '<tr>' + cols.map(c => `<${tag}>${c.trim()}</${tag}>`).join('') + '</tr>';
      });
      html += '</table>';
      return html;
    });

    // Lists (unordered and ordered)
    processed = processed.replace(/^\s*[\*\-]\s+(.*$)/gim, '<li>$1</li>');
    processed = processed.replace(/(<li>.*<\/li>)/gms, '<ul>$1</ul>');
    processed = processed.replace(/<\/ul>\s*<ul>/g, '');

    processed = processed.replace(/^\s*(\d+)\.\s+(.*$)/gim, '<li>$2</li>');

    // Paragraph line breaks
    processed = processed.replace(/\n\n+/g, '</p><p>');
    processed = processed.replace(/\n/g, '<br>');
    processed = `<p>${processed}</p>`;
    processed = processed.replace(/<p><\/p>/g, '');

    // Restore Code Blocks with Copy button and styling
    codeBlocks.forEach((block, idx) => {
      const placeholder = `__CODE_BLOCK_${idx}__`;
      const escapedCode = escapeHtml(block.code);
      const highlighted = highlightSimpleSyntax(escapedCode, block.lang);
      const blockHtml = `
        <div class="code-block-wrapper">
          <div class="code-header">
            <span>${escapeHtml(block.lang)}</span>
            <button class="btn-copy-code" data-code="${encodeURIComponent(block.code)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
              </svg>
              <span>Copy code</span>
            </button>
          </div>
          <pre><code class="language-${block.lang}">${highlighted}</code></pre>
        </div>
      `;
      processed = processed.replace(placeholder, blockHtml);
    });

    return processed;
  }

  // Syntax highlighting for common keywords, strings, comments
  function highlightSimpleSyntax(code, lang) {
    return code
      .replace(/(\/\/[^\n]*|#[^\n]*)/g, '<span style="color:#71717a;font-style:italic;">$1</span>')
      .replace(/(&quot;.*?&quot;|&#039;.*?&#039;|`.*?`)/g, '<span style="color:#98c379;">$1</span>')
      .replace(/\b(const|let|var|function|return|import|export|from|class|if|else|for|while|async|await|def|print|None|True|False)\b/g, '<span style="color:#c678dd;font-weight:600;">$1</span>')
      .replace(/\b(true|false|null|undefined)\b/g, '<span style="color:#d19a66;">$1</span>')
      .replace(/\b([0-9]+)\b/g, '<span style="color:#61afef;">$1</span>');
  }

  // =========================================================================
  // 5. Intelligent Simulated Responder & Live API Engine
  // =========================================================================
  class AIService {
    static async generateResponse({ prompt, attachments, history, onChunk, signal }) {
      const provider = state.settings.provider;
      const apiKey = state.settings.apiKey.trim();

      // If provider is gemini or key is a Google key (AQ. / AIza), call Google Gemini Live API
      if (provider === 'gemini' || apiKey.startsWith('AQ.') || apiKey.startsWith('AIza')) {
        return await AIService.callGeminiAPI({ prompt, attachments, history, onChunk, signal });
      }

      // If an API key is provided and a live provider is selected, connect via API
      if (apiKey && provider !== 'simulated') {
        return await AIService.callLiveAPI({ prompt, attachments, history, onChunk, signal });
      }

      // Otherwise, use high-fidelity interactive simulation
      return await AIService.simulateResponse({ prompt, attachments, history, onChunk, signal });
    }

    // High-Fidelity Streaming Simulator
    static async simulateResponse({ prompt, attachments, history, onChunk, signal }) {
      const lower = (prompt || '').toLowerCase();
      let responseText = '';

      // Context-aware response generation
      if (attachments && attachments.length > 0) {
        const imgCount = attachments.filter(a => a.isImage).length;
        const fileCount = attachments.length - imgCount;
        const fileNames = attachments.map(a => `\`${a.name}\``).join(', ');

        responseText = `I received your attachment${attachments.length > 1 ? 's' : ''}: ${fileNames}.\n\n`;

        if (imgCount > 0) {
          responseText += `### 🖼️ Visual Inspection & Image Analysis\n\n`;
          responseText += `I've analyzed the uploaded image data:\n`;
          responseText += `- **File**: ${attachments.find(a => a.isImage).name} (${attachments.find(a => a.isImage).sizeFormatted})\n`;
          responseText += `- **Visual Composition**: High-clarity visual asset. Features sharp contrast, modern composition, and balanced proportions.\n`;
          responseText += `- **Key Elements**: Color palette appears cohesive. Visual hierarchy is clearly defined.\n\n`;
          responseText += `If you would like me to extract specific text, recommend UI improvements, or convert this design into code, let me know!\n\n`;
        }

        if (fileCount > 0) {
          responseText += `### 📄 Document & File Summary\n\n`;
          responseText += `The uploaded document has been staged for processing:\n`;
          responseText += `- Parsed metadata and validated integrity.\n`;
          responseText += `- Ready to generate section summaries, conduct data analysis, or refactor contents.\n\n`;
        }

        if (prompt.trim()) {
          responseText += `Regarding your question: *"${prompt.trim()}"*\n\n`;
          responseText += `Everything looks properly configured. I'm ready to assist with further questions or transformations!`;
        }
      } else if (lower.includes('code') || lower.includes('python') || lower.includes('javascript') || lower.includes('html') || lower.includes('css')) {
        responseText = `Here is a clean, modern implementation for you:\n\n`;
        responseText += `\`\`\`javascript\n// Modern ES6+ Interactive Counter Utility\nclass InteractiveWidget {\n  constructor(initialCount = 0) {\n    this.count = initialCount;\n  }\n\n  increment() {\n    this.count += 1;\n    this.render();\n  }\n\n  render() {\n    console.log(\`[Widget] Current status: \${this.count}\`);\n  }\n}\n\n// Usage example:\nconst widget = new InteractiveWidget(10);\nwidget.increment();\n\`\`\`\n\n### Key Highlights:\n1. **Encapsulation**: Object-oriented architecture with clean state updates.\n2. **Extensible**: Ready for event listeners and DOM binding.\n3. **Modern Standards**: Fully compatible with ES2024 specifications.\n\nWould you like me to adapt this for a specific framework or add additional methods?`;
      } else if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
        responseText = `Hello! 👋 I'm **CAI**, your interactive personal AI assistant.\n\nI can help you with:\n- 📝 Writing, drafting, and summarizing content\n- 💻 Generating and debugging code\n- 🖼️ Analyzing uploaded photos and files\n- 💡 Brainstorming solutions and structured planning\n\nHow can I help you today?`;
      } else if (lower.includes('api') || lower.includes('key') || lower.includes('settings')) {
        responseText = `You can easily configure your live API key at any time!\n\n### How to connect your API Key:\n1. Click the **Settings icon (⚙️)** in the bottom left or top right.\n2. Select your provider (**OpenAI**, **Gemini**, or **Anthropic**).\n3. Paste your API key in the field.\n4. Click **Save Settings**.\n\nOnce saved, CAI will automatically connect to live streaming endpoints while keeping your conversation history safe in local storage!`;
      } else {
        responseText = `Thank you for your message!\n\nHere are some key insights regarding **${prompt.trim() || 'your prompt'}**:\n\n1. **Comprehensive Evaluation**: The approach balances speed, modern aesthetics, and maintainability.\n2. **Interactive Capabilities**: Full support for rich markdown, copyable code snippets, and multimodal file previews.\n3. **Flexibility**: Ready for immediate offline workflow or live model integration.\n\n> "Simplicity and responsiveness are at the core of great AI interfaces."\n\nFeel free to upload photos, attach code or documents, or ask any technical or creative questions!`;
      }

      // Stream character by character or chunk by chunk
      const chunks = responseText.split(/(\s+)/); // Preserve spaces
      let accumulated = '';

      for (let i = 0; i < chunks.length; i++) {
        if (signal && signal.aborted) {
          throw new DOMException('Aborted by user', 'AbortError');
        }

        accumulated += chunks[i];
        onChunk(accumulated);

        // Natural typing pacing
        const delay = Math.floor(Math.random() * 20) + 12;
        await new Promise((r) => setTimeout(r, delay));
      }

      return accumulated;
    }

    // Google Gemini Live Streaming API Pipeline (supports text, photos & auto-fallbacks)
    static async callGeminiAPI({ prompt, attachments, history, onChunk, signal }) {
      const { apiKey, model, systemPrompt } = state.settings;
      const effectiveKey = (apiKey || 'AQ.Ab8RN6KoHuNmfdw2wH4IHjeKSpofil9lW_lsPRbRR4z8dR227A').trim();

      // Preferred models to try in order (ensures ultra-high availability)
      const preferredModel = (model && !model.includes('gpt') && !model.includes('claude')) ? model : 'gemini-flash-lite-latest';
      const modelsToTry = [
        preferredModel,
        'gemini-flash-lite-latest',
        'gemini-3.1-flash-lite',
        'gemini-3.5-flash-lite',
        'gemini-flash-latest'
      ];
      const candidateModels = [...new Set(modelsToTry)];

      // Build Gemini conversation history
      const contents = [];

      // Context turns (last 10 messages)
      const recentHistory = (history || []).slice(-10);
      recentHistory.forEach((msg) => {
        const role = msg.role === 'assistant' ? 'model' : 'user';
        const parts = [];

        // Attachments in history
        if (msg.attachments && msg.attachments.length > 0) {
          msg.attachments.forEach((att) => {
            if (att.isImage && att.dataUrl && att.dataUrl.includes(',')) {
              parts.push({
                inline_data: {
                  mime_type: att.type || 'image/jpeg',
                  data: att.dataUrl.split(',')[1]
                }
              });
            }
          });
        }

        parts.push({ text: msg.text || '' });
        contents.push({ role, parts });
      });

      // Current User Turn
      const currentParts = [];

      // Current Attachments (photos & documents)
      let combinedPrompt = prompt || '';
      if (attachments && attachments.length > 0) {
        attachments.forEach((att) => {
          if (att.isImage && att.dataUrl && att.dataUrl.includes(',')) {
            currentParts.push({
              inline_data: {
                mime_type: att.type || 'image/jpeg',
                data: att.dataUrl.split(',')[1]
              }
            });
          } else if (!att.isImage && att.dataUrl) {
            try {
              if (att.dataUrl.startsWith('data:text/') || att.dataUrl.startsWith('data:application/json')) {
                const textContent = atob(att.dataUrl.split(',')[1]);
                combinedPrompt += `\n\n[Attached File: ${att.name}]\n\`\`\`\n${textContent}\n\`\`\``;
              } else {
                combinedPrompt += `\n\n[Attached File: ${att.name} (${att.sizeFormatted || ''})]`;
              }
            } catch (e) {
              combinedPrompt += `\n\n[Attached File: ${att.name}]`;
            }
          }
        });
      }

      currentParts.push({ text: combinedPrompt.trim() || 'Hello, how can you help me?' });
      contents.push({ role: 'user', parts: currentParts });

      const payload = { contents };
      if (systemPrompt && systemPrompt.trim()) {
        payload.system_instruction = {
          parts: [{ text: systemPrompt.trim() }]
        };
      }

      let lastError = null;

      for (const curModel of candidateModels) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${curModel}:streamGenerateContent?alt=sse&key=${effectiveKey}`;

        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: signal
          });

          if (!response.ok) {
            const errJson = await response.json().catch(() => ({}));
            const errMsg = errJson.error?.message || `HTTP ${response.status}`;
            // If model is busy or quota limited, try next candidate
            if (response.status === 503 || response.status === 404 || response.status === 429) {
              console.warn(`Model ${curModel} returned ${response.status}: ${errMsg}. Trying fallback...`);
              lastError = new Error(`[${curModel}] ${errMsg}`);
              continue;
            }
            throw new Error(`Gemini API Error (${response.status}): ${errMsg}`);
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder('utf-8');
          let fullText = '';
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data: ')) continue;

              try {
                const json = JSON.parse(trimmed.slice(6));
                const candidates = json.candidates || [];
                if (candidates.length > 0 && candidates[0].content?.parts) {
                  for (const part of candidates[0].content.parts) {
                    if (part.text) {
                      fullText += part.text;
                      onChunk(fullText);
                    }
                  }
                }
              } catch (e) {
                // Ignore partial JSON chunks
              }
            }
          }

          if (fullText) {
            if (curModel !== state.settings.model) {
              state.settings.model = curModel;
              updateModelBadgeUI();
            }
            return fullText;
          }
        } catch (err) {
          if (err.name === 'AbortError') {
            throw err;
          }
          lastError = err;
          console.warn(`Error on model ${curModel}:`, err);
        }
      }

      throw lastError || new Error('Could not receive streaming response from Google Gemini API.');
    }

    // Generic OpenAI-compatible Live Streaming API Pipeline
    static async callLiveAPI({ prompt, attachments, history, onChunk, signal }) {
      const { provider, apiKey, model, endpoint, systemPrompt } = state.settings;

      let url = endpoint.trim() || 'https://api.openai.com/v1/chat/completions';
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      };

      const messages = [];
      if (systemPrompt.trim()) {
        messages.push({ role: 'system', content: systemPrompt });
      }

      const recentHistory = (history || []).slice(-8);
      recentHistory.forEach((msg) => {
        messages.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.text
        });
      });

      let userContent = prompt;
      if (attachments && attachments.length > 0) {
        const parts = [{ type: 'text', text: prompt || 'Please analyze these files.' }];
        attachments.forEach((att) => {
          if (att.isImage && att.dataUrl) {
            parts.push({
              type: 'image_url',
              image_url: { url: att.dataUrl }
            });
          }
        });
        userContent = parts;
      }

      messages.push({ role: 'user', content: userContent });

      const requestBody = {
        model: model.trim() || 'gpt-4o',
        messages: messages,
        stream: true
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody),
        signal: signal
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API Error (${response.status}): ${errText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;
          if (trimmed === 'data: [DONE]') break;

          if (trimmed.startsWith('data: ')) {
            try {
              const json = JSON.parse(trimmed.slice(6));
              const delta = json.choices?.[0]?.delta?.content || '';
              if (delta) {
                fullText += delta;
                onChunk(fullText);
              }
            } catch (err) {
              // Ignore partial JSON
            }
          }
        }
      }

      return fullText;
    }
  }

  // =========================================================================
  // 6. Chat & Storage Operations
  // =========================================================================
  function loadStoredData() {
    try {
      const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME) || 'dark';
      setTheme(savedTheme);

      const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (savedSettings) {
        state.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) };
      }

      // Guarantee Gemini is active with user provided API key
      if (!state.settings.apiKey || state.settings.provider === 'simulated' || state.settings.apiKey.startsWith('sk-')) {
        state.settings.provider = 'gemini';
        state.settings.apiKey = 'AQ.Ab8RN6KoHuNmfdw2wH4IHjeKSpofil9lW_lsPRbRR4z8dR227A';
        state.settings.model = 'gemini-flash-lite-latest';
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(state.settings));
      }

      const savedChats = localStorage.getItem(STORAGE_KEYS.CHATS);
      if (savedChats) {
        state.chats = JSON.parse(savedChats);
      }

      const savedActiveId = localStorage.getItem(STORAGE_KEYS.ACTIVE_CHAT);
      if (savedActiveId && state.chats.some(c => c.id === savedActiveId)) {
        state.activeChatId = savedActiveId;
      } else if (state.chats.length > 0) {
        state.activeChatId = state.chats[0].id;
      } else {
        createNewChat(false);
      }
    } catch (err) {
      console.warn('Storage initialization fallback:', err);
      createNewChat(false);
    }

    updateSettingsModalFields();
    updateModelBadgeUI();
  }

  function saveChatsToStorage() {
    try {
      localStorage.setItem(STORAGE_KEYS.CHATS, JSON.stringify(state.chats));
      if (state.activeChatId) {
        localStorage.setItem(STORAGE_KEYS.ACTIVE_CHAT, state.activeChatId);
      }
    } catch (err) {
      console.warn('LocalStorage save error (likely quota):', err);
      showToast('Storage limit reached. Older attachments may not persist.');
    }
  }

  function saveSettingsToStorage() {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(state.settings));
      showToast('Settings saved successfully!');
    } catch (err) {
      console.error(err);
    }
  }

  function getActiveChat() {
    return state.chats.find(c => c.id === state.activeChatId) || null;
  }

  function createNewChat(switchToIt = true) {
    const newChat = {
      id: generateId('chat'),
      title: 'New Chat',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: []
    };

    state.chats.unshift(newChat);
    saveChatsToStorage();

    if (switchToIt) {
      switchChat(newChat.id);
    }
    return newChat;
  }

  function switchChat(chatId) {
    if (state.isGenerating) {
      stopGeneration();
    }

    state.activeChatId = chatId;
    localStorage.setItem(STORAGE_KEYS.ACTIVE_CHAT, chatId);

    // Close mobile sidebar if open
    closeSidebarMobile();

    renderChatList();
    renderActiveChatMessages();
    clearPendingAttachments();
    DOM.chatInput.value = '';
    autoResizeInput();
    updateSendButtonState();
    DOM.chatInput.focus();
  }

  function deleteChat(chatId, event) {
    if (event) event.stopPropagation();

    const idx = state.chats.findIndex(c => c.id === chatId);
    if (idx === -1) return;

    state.chats.splice(idx, 1);

    if (state.chats.length === 0) {
      createNewChat(true);
    } else if (state.activeChatId === chatId) {
      const nextChat = state.chats[Math.max(0, idx - 1)];
      switchChat(nextChat.id);
    } else {
      saveChatsToStorage();
      renderChatList();
    }
    showToast('Conversation deleted');
  }

  function renameChat(chatId, event) {
    if (event) event.stopPropagation();
    const chat = state.chats.find(c => c.id === chatId);
    if (!chat) return;

    const currentTitle = chat.title;
    const newTitle = prompt('Rename conversation:', currentTitle);
    if (newTitle && newTitle.trim() && newTitle.trim() !== currentTitle) {
      chat.title = newTitle.trim();
      chat.updatedAt = new Date().toISOString();
      saveChatsToStorage();
      renderChatList();
      if (state.activeChatId === chatId) {
        DOM.topChatTitle.textContent = chat.title;
      }
      showToast('Conversation renamed');
    }
  }

  function clearCurrentChat() {
    const chat = getActiveChat();
    if (!chat) return;

    if (confirm('Clear all messages from this conversation?')) {
      chat.messages = [];
      chat.title = 'New Chat';
      chat.updatedAt = new Date().toISOString();
      saveChatsToStorage();
      renderChatList();
      renderActiveChatMessages();
      showToast('Conversation cleared');
    }
  }

  function clearAllChats() {
    if (confirm('Are you sure you want to permanently delete all conversations?')) {
      state.chats = [];
      localStorage.removeItem(STORAGE_KEYS.CHATS);
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_CHAT);
      createNewChat(true);
      closeSettingsModal();
      showToast('All conversations deleted');
    }
  }

  function exportConversationsJSON() {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state.chats, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `cai_conversations_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
    showToast('Exported conversations to JSON');
  }

  // =========================================================================
  // 7. UI Rendering Functions
  // =========================================================================
  function renderChatList() {
    const filterQuery = (DOM.searchChatsInput.value || '').trim().toLowerCase();
    DOM.chatList.innerHTML = '';

    const filtered = state.chats.filter(c => {
      if (!filterQuery) return true;
      return (c.title || '').toLowerCase().includes(filterQuery) ||
        c.messages.some(m => (m.text || '').toLowerCase().includes(filterQuery));
    });

    if (filtered.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.style.padding = '12px 10px';
      emptyDiv.style.fontSize = '12px';
      emptyDiv.style.color = 'var(--text-muted)';
      emptyDiv.textContent = filterQuery ? 'No matching conversations' : 'No chats yet';
      DOM.chatList.appendChild(emptyDiv);
      return;
    }

    filtered.forEach(chat => {
      const item = document.createElement('div');
      item.className = `chat-item ${chat.id === state.activeChatId ? 'active' : ''}`;
      item.dataset.id = chat.id;

      item.innerHTML = `
        <span class="chat-item-title">${escapeHtml(chat.title || 'New Chat')}</span>
        <div class="chat-item-actions">
          <button class="chat-item-btn btn-rename tooltip" data-tooltip="Rename" aria-label="Rename">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
              <path d="m15 5 4 4"/>
            </svg>
          </button>
          <button class="chat-item-btn btn-delete tooltip" data-tooltip="Delete" aria-label="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"/>
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
            </svg>
          </button>
        </div>
      `;

      item.addEventListener('click', () => switchChat(chat.id));

      const renameBtn = item.querySelector('.btn-rename');
      renameBtn.addEventListener('click', (e) => renameChat(chat.id, e));

      const deleteBtn = item.querySelector('.btn-delete');
      deleteBtn.addEventListener('click', (e) => deleteChat(chat.id, e));

      DOM.chatList.appendChild(item);
    });

    const activeChat = getActiveChat();
    DOM.topChatTitle.textContent = activeChat ? activeChat.title : 'New Chat';
  }

  function renderActiveChatMessages() {
    const chat = getActiveChat();
    DOM.messagesList.innerHTML = '';

    if (!chat || chat.messages.length === 0) {
      DOM.welcomeHero.style.display = 'flex';
      return;
    }

    DOM.welcomeHero.style.display = 'none';

    chat.messages.forEach(msg => {
      appendMessageToDOM(msg, false);
    });

    scrollToBottom();
  }

  function appendMessageToDOM(msg, shouldScroll = true) {
    DOM.welcomeHero.style.display = 'none';

    const row = document.createElement('div');
    row.className = `message-row ${msg.role === 'user' ? 'user-row' : 'assistant-row'}`;
    row.id = `msg-${msg.id}`;

    if (msg.role === 'user') {
      let attachmentsHtml = '';
      if (msg.attachments && msg.attachments.length > 0) {
        attachmentsHtml = '<div class="message-attachments">';
        msg.attachments.forEach(att => {
          if (att.isImage) {
            attachmentsHtml += `
              <img src="${att.dataUrl}" alt="${escapeHtml(att.name)}" class="chat-image-thumbnail" data-img="${att.dataUrl}" data-name="${escapeHtml(att.name)}">
            `;
          } else {
            attachmentsHtml += `
              <div class="chat-file-card">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                <div class="chat-file-details">
                  <span class="chat-file-name">${escapeHtml(att.name)}</span>
                  <span class="chat-file-size">${att.sizeFormatted || ''}</span>
                </div>
              </div>
            `;
          }
        });
        attachmentsHtml += '</div>';
      }

      row.innerHTML = `
        <div class="message-inner">
          <div class="user-bubble">
            ${attachmentsHtml}
            <div class="user-text">${escapeHtml(msg.text).replace(/\n/g, '<br>')}</div>
          </div>
        </div>
      `;
    } else {
      // Assistant message
      const parsedContent = parseMarkdown(msg.text);

      row.innerHTML = `
        <div class="message-inner">
          <div class="message-avatar assistant-avatar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2a10 10 0 0 1 10 10c0 4.418-2.865 8.166-6.839 9.49.339-.774.539-1.63.539-2.54 0-3.314-2.686-6-6-6s-6 2.686-6 6c0 .91.2 1.766.539 2.54C3.865 20.166 1 16.418 1 12A10 10 0 0 1 12 2z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </div>
          <div class="message-content">
            <div class="msg-body">${parsedContent}</div>
            <div class="message-actions">
              <button class="action-icon-btn btn-copy-msg" data-msg-id="${msg.id}" title="Copy response">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                </svg>
                <span>Copy</span>
              </button>
              <button class="action-icon-btn btn-tts-msg" data-msg-id="${msg.id}" title="Read aloud">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                </svg>
                <span>Read</span>
              </button>
              <button class="action-icon-btn btn-regen-msg" data-msg-id="${msg.id}" title="Regenerate">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                  <path d="M3 3v5h5"/>
                  <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
                  <path d="M16 21h5v-5"/>
                </svg>
                <span>Regenerate</span>
              </button>
            </div>
          </div>
        </div>
      `;
    }

    DOM.messagesList.appendChild(row);

    // Bind image click for lightbox
    row.querySelectorAll('.chat-image-thumbnail').forEach(img => {
      img.addEventListener('click', () => {
        openLightbox(img.dataset.img, img.dataset.name);
      });
    });

    // Bind copy code block buttons
    bindCodeCopyButtons(row);

    if (shouldScroll) {
      scrollToBottom();
    }
  }

  function bindCodeCopyButtons(container) {
    container.querySelectorAll('.btn-copy-code').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const codeText = decodeURIComponent(btn.dataset.code);
        navigator.clipboard.writeText(codeText).then(() => {
          const originalText = btn.innerHTML;
          btn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="#10a37f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span style="color:#10a37f">Copied!</span>
          `;
          setTimeout(() => { btn.innerHTML = originalText; }, 2000);
        });
      });
    });

    // Copy message button
    container.querySelectorAll('.btn-copy-msg').forEach(btn => {
      btn.addEventListener('click', () => {
        const msgId = btn.dataset.msgId;
        const chat = getActiveChat();
        const message = chat?.messages.find(m => m.id === msgId);
        if (message) {
          navigator.clipboard.writeText(message.text).then(() => {
            showToast('Response copied to clipboard');
          });
        }
      });
    });

    // Text to speech button
    container.querySelectorAll('.btn-tts-msg').forEach(btn => {
      btn.addEventListener('click', () => {
        const msgId = btn.dataset.msgId;
        const chat = getActiveChat();
        const message = chat?.messages.find(m => m.id === msgId);
        if (message) {
          toggleSpeech(message.text, btn);
        }
      });
    });

    // Regenerate response button
    container.querySelectorAll('.btn-regen-msg').forEach(btn => {
      btn.addEventListener('click', () => {
        const msgId = btn.dataset.msgId;
        regenerateMessage(msgId);
      });
    });
  }

  function toggleSpeech(text, buttonElement) {
    if (!('speechSynthesis' in window)) {
      showToast('Speech synthesis is not supported in this browser.');
      return;
    }

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      buttonElement.querySelector('span').textContent = 'Read';
      return;
    }

    // Clean markdown before speaking
    const cleanText = text
      .replace(/```[\s\S]*?```/g, 'Code block omitted.')
      .replace(/[#*`_>\[\]]/g, '')
      .replace(/\n+/g, ' ');

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    buttonElement.querySelector('span').textContent = 'Stop';

    utterance.onend = () => {
      buttonElement.querySelector('span').textContent = 'Read';
    };
    utterance.onerror = () => {
      buttonElement.querySelector('span').textContent = 'Read';
    };

    window.speechSynthesis.speak(utterance);
  }

  function scrollToBottom(smooth = true) {
    DOM.messagesContainer.scrollTo({
      top: DOM.messagesContainer.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto'
    });
  }

  // =========================================================================
  // 8. File & Photo Upload Handling
  // =========================================================================
  async function handleSelectedFiles(files) {
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isImage = file.type.startsWith('image/');
      let dataUrl = '';

      if (isImage) {
        dataUrl = await processImageFile(file);
      } else {
        // Read small text files for preview/context
        dataUrl = await readFileDataUrl(file);
      }

      state.pendingAttachments.push({
        id: generateId('att'),
        name: file.name,
        size: file.size,
        sizeFormatted: formatFileSize(file.size),
        type: file.type || 'application/octet-stream',
        isImage: isImage,
        dataUrl: dataUrl
      });
    }

    renderPendingAttachments();
    updateSendButtonState();
    DOM.chatInput.focus();
  }

  function readFileDataUrl(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  }

  function renderPendingAttachments() {
    if (state.pendingAttachments.length === 0) {
      DOM.attachmentPreviewRack.style.display = 'none';
      DOM.attachmentPreviewRack.innerHTML = '';
      return;
    }

    DOM.attachmentPreviewRack.style.display = 'flex';
    DOM.attachmentPreviewRack.innerHTML = '';

    state.pendingAttachments.forEach(att => {
      const card = document.createElement('div');
      card.className = `attachment-preview-card ${att.isImage ? 'is-image' : ''}`;
      card.id = `att-${att.id}`;

      if (att.isImage) {
        card.innerHTML = `
          <img src="${att.dataUrl}" alt="${escapeHtml(att.name)}" class="attachment-img-preview">
          <button class="attachment-remove-btn" data-id="${att.id}" aria-label="Remove attachment">&times;</button>
        `;
      } else {
        card.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;color:var(--accent-primary);flex-shrink:0;">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <div class="attachment-info">
            <span class="attachment-name">${escapeHtml(att.name)}</span>
            <span class="attachment-size">${att.sizeFormatted}</span>
          </div>
          <button class="attachment-remove-btn" data-id="${att.id}" aria-label="Remove attachment">&times;</button>
        `;
      }

      const removeBtn = card.querySelector('.attachment-remove-btn');
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removePendingAttachment(att.id);
      });

      DOM.attachmentPreviewRack.appendChild(card);
    });
  }

  function removePendingAttachment(attachmentId) {
    state.pendingAttachments = state.pendingAttachments.filter(a => a.id !== attachmentId);
    renderPendingAttachments();
    updateSendButtonState();
  }

  function clearPendingAttachments() {
    state.pendingAttachments = [];
    renderPendingAttachments();
  }

  // =========================================================================
  // 9. Sending Messages & Typewriter Streaming Flow
  // =========================================================================
  async function sendMessage() {
    const text = DOM.chatInput.value.trim();
    const attachments = [...state.pendingAttachments];

    if ((!text && attachments.length === 0) || state.isGenerating) {
      return;
    }

    let chat = getActiveChat();
    if (!chat) {
      chat = createNewChat(true);
    }

    // Auto-title conversation on first message
    if (chat.messages.length === 0) {
      let title = text || (attachments[0] ? `File: ${attachments[0].name}` : 'New Chat');
      if (title.length > 30) {
        title = title.substring(0, 30) + '...';
      }
      chat.title = title;
      DOM.topChatTitle.textContent = title;
      saveChatsToStorage();
      renderChatList();
    }

    // Create user message object
    const userMsg = {
      id: generateId('msg_user'),
      role: 'user',
      text: text,
      attachments: attachments,
      timestamp: new Date().toISOString()
    };

    chat.messages.push(userMsg);
    chat.updatedAt = new Date().toISOString();
    saveChatsToStorage();

    // Render User message
    appendMessageToDOM(userMsg, true);

    // Reset input dock
    DOM.chatInput.value = '';
    clearPendingAttachments();
    autoResizeInput();
    updateSendButtonState();

    // Begin Assistant Response Stream
    await runAssistantResponse(chat, userMsg);
  }

  async function runAssistantResponse(chat, triggerUserMsg) {
    state.isGenerating = true;
    state.abortController = new AbortController();
    setGeneratingUI(true);

    // Create placeholder assistant message row
    const assistantMsgId = generateId('msg_cai');
    const assistantRow = document.createElement('div');
    assistantRow.className = 'message-row assistant-row';
    assistantRow.id = `msg-${assistantMsgId}`;

    assistantRow.innerHTML = `
      <div class="message-inner">
        <div class="message-avatar assistant-avatar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2a10 10 0 0 1 10 10c0 4.418-2.865 8.166-6.839 9.49.339-.774.539-1.63.539-2.54 0-3.314-2.686-6-6-6s-6 2.686-6 6c0 .91.2 1.766.539 2.54C3.865 20.166 1 16.418 1 12A10 10 0 0 1 12 2z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </div>
        <div class="message-content">
          <div class="msg-body"><span class="streaming-cursor"></span></div>
        </div>
      </div>
    `;

    DOM.messagesList.appendChild(assistantRow);
    scrollToBottom();

    const bodyEl = assistantRow.querySelector('.msg-body');
    let finalAssistantText = '';

    try {
      finalAssistantText = await AIService.generateResponse({
        prompt: triggerUserMsg.text,
        attachments: triggerUserMsg.attachments,
        history: chat.messages.slice(0, -1),
        signal: state.abortController.signal,
        onChunk: (chunkText) => {
          bodyEl.innerHTML = parseMarkdown(chunkText) + '<span class="streaming-cursor"></span>';
          bindCodeCopyButtons(assistantRow);
          scrollToBottom(false);
        }
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        finalAssistantText = bodyEl.textContent.replace('▋', '').trim() + '\n\n*(Generation stopped)*';
      } else {
        console.error('Error generating response:', err);
        finalAssistantText = `⚠️ **Error occurred while processing:**\n\n\`${err.message || err}\`\n\nPlease check your settings or try again.`;
      }
    } finally {
      // Remove streaming cursor
      bodyEl.innerHTML = parseMarkdown(finalAssistantText);

      // Add actions toolbar
      const contentEl = assistantRow.querySelector('.message-content');
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'message-actions';
      actionsDiv.innerHTML = `
        <button class="action-icon-btn btn-copy-msg" data-msg-id="${assistantMsgId}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
          </svg>
          <span>Copy</span>
        </button>
        <button class="action-icon-btn btn-tts-msg" data-msg-id="${assistantMsgId}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
          </svg>
          <span>Read</span>
        </button>
        <button class="action-icon-btn btn-regen-msg" data-msg-id="${assistantMsgId}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
            <path d="M16 21h5v-5"/>
          </svg>
          <span>Regenerate</span>
        </button>
      `;
      contentEl.appendChild(actionsDiv);
      bindCodeCopyButtons(assistantRow);

      // Save to chat state
      const assistantMsg = {
        id: assistantMsgId,
        role: 'assistant',
        text: finalAssistantText,
        timestamp: new Date().toISOString()
      };
      chat.messages.push(assistantMsg);
      chat.updatedAt = new Date().toISOString();
      saveChatsToStorage();

      state.isGenerating = false;
      state.abortController = null;
      setGeneratingUI(false);
      scrollToBottom();
    }
  }

  function stopGeneration() {
    if (state.abortController) {
      state.abortController.abort();
    }
    state.isGenerating = false;
    setGeneratingUI(false);
    showToast('Generation halted');
  }

  function regenerateMessage(assistantMsgId) {
    const chat = getActiveChat();
    if (!chat || state.isGenerating) return;

    const idx = chat.messages.findIndex(m => m.id === assistantMsgId);
    if (idx === -1) return;

    // Find preceding user message
    const precedingUserMsg = chat.messages.slice(0, idx).reverse().find(m => m.role === 'user');
    if (!precedingUserMsg) return;

    // Remove this assistant message and any subsequent messages
    chat.messages.splice(idx);
    saveChatsToStorage();
    renderActiveChatMessages();

    // Trigger regeneration
    runAssistantResponse(chat, precedingUserMsg);
  }

  function setGeneratingUI(isGenerating) {
    if (isGenerating) {
      DOM.sendBtn.classList.add('generating');
      DOM.sendBtn.disabled = false;
      DOM.sendBtn.setAttribute('aria-label', 'Stop generating');
    } else {
      DOM.sendBtn.classList.remove('generating');
      updateSendButtonState();
      DOM.sendBtn.setAttribute('aria-label', 'Send message');
    }
  }

  function updateSendButtonState() {
    const hasText = DOM.chatInput.value.trim().length > 0;
    const hasAttachments = state.pendingAttachments.length > 0;
    DOM.sendBtn.disabled = !hasText && !hasAttachments && !state.isGenerating;
  }

  function autoResizeInput() {
    DOM.chatInput.style.height = 'auto';
    const newHeight = Math.min(DOM.chatInput.scrollHeight, 180);
    DOM.chatInput.style.height = `${newHeight}px`;
  }

  // =========================================================================
  // 10. Modals & Lightbox Handling
  // =========================================================================
  function openLightbox(imgSrc, filename) {
    DOM.lightboxImage.src = imgSrc;
    DOM.lightboxFilename.textContent = filename || 'image.png';
    DOM.lightboxDownloadBtn.href = imgSrc;
    DOM.lightboxDownloadBtn.download = filename || 'downloaded_image.png';
    DOM.imageLightboxModal.classList.add('active');
  }

  function closeLightbox() {
    DOM.imageLightboxModal.classList.remove('active');
    DOM.lightboxImage.src = '';
  }

  function openSettingsModal() {
    updateSettingsModalFields();
    DOM.settingsModal.classList.add('active');
  }

  function closeSettingsModal() {
    DOM.settingsModal.classList.remove('active');
  }

  function updateSettingsModalFields() {
    DOM.apiProviderSelect.value = state.settings.provider;
    DOM.apiKeyInput.value = state.settings.apiKey;
    DOM.apiModelInput.value = state.settings.model;
    DOM.apiEndpointInput.value = state.settings.endpoint;
    DOM.systemPromptInput.value = state.settings.systemPrompt;
    DOM.userNameInput.value = state.settings.userName;
  }

  function saveSettingsFromModal() {
    state.settings.provider = DOM.apiProviderSelect.value;
    state.settings.apiKey = DOM.apiKeyInput.value.trim();
    state.settings.model = DOM.apiModelInput.value.trim() || 'gpt-4o';
    state.settings.endpoint = DOM.apiEndpointInput.value.trim();
    state.settings.systemPrompt = DOM.systemPromptInput.value.trim();
    state.settings.userName = DOM.userNameInput.value.trim() || 'User';

    saveSettingsToStorage();
    updateModelBadgeUI();
    closeSettingsModal();
  }

  function updateModelBadgeUI() {
    const key = (state.settings.apiKey || '').trim();
    if (state.settings.provider === 'gemini' || key.startsWith('AQ.') || key.startsWith('AIza')) {
      DOM.currentModelLabel.textContent = 'Gemini Flash';
      DOM.currentModelTag.textContent = 'Live AI';
      DOM.modelStatusIndicator.textContent = 'Google Gemini (Connected)';
    } else if (state.settings.provider === 'simulated' || !key) {
      DOM.currentModelLabel.textContent = 'CAI 4.0';
      DOM.currentModelTag.textContent = 'Simulator';
      DOM.modelStatusIndicator.textContent = 'CAI Simulator (Active)';
    } else {
      DOM.currentModelLabel.textContent = state.settings.model || 'Live API';
      DOM.currentModelTag.textContent = state.settings.provider.toUpperCase();
      DOM.modelStatusIndicator.textContent = `${state.settings.provider} (${state.settings.model})`;
    }
  }

  // =========================================================================
  // 11. Theme & Responsive Drawer Controls
  // =========================================================================
  function setTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
  }

  function toggleTheme() {
    const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    showToast(`Switched to ${nextTheme} mode`);
  }

  function toggleSidebar() {
    if (window.innerWidth <= 768) {
      const isOpen = DOM.sidebar.classList.contains('open');
      if (isOpen) {
        closeSidebarMobile();
      } else {
        openSidebarMobile();
      }
    } else {
      DOM.sidebar.classList.toggle('collapsed');
    }
  }

  function openSidebarMobile() {
    DOM.sidebar.classList.add('open');
    DOM.sidebarBackdrop.classList.add('active');
  }

  function closeSidebarMobile() {
    DOM.sidebar.classList.remove('open');
    DOM.sidebarBackdrop.classList.remove('active');
  }

  // =========================================================================
  // 12. Event Listeners Initialization
  // =========================================================================
  function initEventListeners() {
    // New Chat Buttons
    DOM.newChatBtn.addEventListener('click', () => createNewChat(true));
    DOM.mobileNewChatBtn.addEventListener('click', () => createNewChat(true));

    // Clear conversation
    DOM.clearChatBtn.addEventListener('click', clearCurrentChat);

    // Sidebar Toggles
    DOM.collapseSidebarBtn.addEventListener('click', toggleSidebar);
    DOM.openSidebarBtn.addEventListener('click', toggleSidebar);
    DOM.sidebarBackdrop.addEventListener('click', closeSidebarMobile);

    // Theme Toggle
    DOM.themeToggleBtn.addEventListener('click', toggleTheme);

    // Search input
    DOM.searchChatsInput.addEventListener('input', renderChatList);

    // Textarea input & Auto-resize
    DOM.chatInput.addEventListener('input', () => {
      autoResizeInput();
      updateSendButtonState();
    });

    DOM.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Send / Stop button
    DOM.sendBtn.addEventListener('click', () => {
      if (state.isGenerating) {
        stopGeneration();
      } else {
        sendMessage();
      }
    });

    // File input trigger
    DOM.attachBtn.addEventListener('click', () => {
      DOM.fileInput.click();
    });

    DOM.fileInput.addEventListener('change', (e) => {
      handleSelectedFiles(e.target.files);
      DOM.fileInput.value = ''; // reset so same file can be re-added
    });

    // Starter suggestion cards click
    DOM.welcomeHero.querySelectorAll('.suggestion-card').forEach(card => {
      card.addEventListener('click', () => {
        const promptText = card.dataset.prompt;
        DOM.chatInput.value = promptText;
        autoResizeInput();
        updateSendButtonState();
        sendMessage();
      });
    });

    // Scroll to bottom button
    DOM.messagesContainer.addEventListener('scroll', () => {
      const fromBottom = DOM.messagesContainer.scrollHeight - DOM.messagesContainer.scrollTop - DOM.messagesContainer.clientHeight;
      if (fromBottom > 160) {
        DOM.scrollToBottomBtn.style.display = 'flex';
      } else {
        DOM.scrollToBottomBtn.style.display = 'none';
      }
    });

    DOM.scrollToBottomBtn.addEventListener('click', () => scrollToBottom(true));

    // Drag and Drop handling on window
    let dragCounter = 0;
    window.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      DOM.dragDropOverlay.classList.add('active');
    });

    window.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        DOM.dragDropOverlay.classList.remove('active');
        dragCounter = 0;
      }
    });

    window.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      DOM.dragDropOverlay.classList.remove('active');
      if (e.dataTransfer && e.dataTransfer.files) {
        handleSelectedFiles(e.dataTransfer.files);
      }
    });

    // Clipboard paste support (Ctrl+V) for screenshots & copied images
    window.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const pastedFiles = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file') {
          const file = items[i].getAsFile();
          if (file) pastedFiles.push(file);
        }
      }

      if (pastedFiles.length > 0) {
        handleSelectedFiles(pastedFiles);
        showToast(`Attached ${pastedFiles.length} item(s) from clipboard`);
      }
    });

    // Settings Modal
    DOM.settingsBtn.addEventListener('click', openSettingsModal);
    DOM.modelBadge.addEventListener('click', openSettingsModal);
    DOM.closeSettingsBtn.addEventListener('click', closeSettingsModal);
    DOM.cancelSettingsBtn.addEventListener('click', closeSettingsModal);
    DOM.settingsBackdrop.addEventListener('click', closeSettingsModal);
    DOM.saveSettingsBtn.addEventListener('click', saveSettingsFromModal);

    // Settings Tabs
    document.querySelectorAll('.settings-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const targetPane = document.getElementById(tab.dataset.tab);
        if (targetPane) targetPane.classList.add('active');
      });
    });

    // Toggle API key password visibility
    DOM.toggleApiKeyVisibility.addEventListener('click', () => {
      const isPass = DOM.apiKeyInput.type === 'password';
      DOM.apiKeyInput.type = isPass ? 'text' : 'password';
      DOM.toggleApiKeyVisibility.querySelector('.eye-open').style.display = isPass ? 'none' : 'block';
      DOM.toggleApiKeyVisibility.querySelector('.eye-closed').style.display = isPass ? 'block' : 'none';
    });

    // Settings data actions
    DOM.exportChatsBtn.addEventListener('click', exportConversationsJSON);
    DOM.clearAllChatsBtn.addEventListener('click', clearAllChats);

    // Lightbox modal close
    DOM.closeLightboxBtn.addEventListener('click', closeLightbox);
    DOM.lightboxBackdrop.addEventListener('click', closeLightbox);

    // Escape key modal closer
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeLightbox();
        closeSettingsModal();
      }
    });
  }

  // =========================================================================
  // 13. Application Bootstrap
  // =========================================================================
  function initApp() {
    loadStoredData();
    renderChatList();
    renderActiveChatMessages();
    initEventListeners();
    autoResizeInput();
    updateSendButtonState();
  }

  // Start when DOM is loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

})();
