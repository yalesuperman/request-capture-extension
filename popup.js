// 存储捕获的请求
let capturedRequests = [];
let isCapturing = false;
let selectedRequestId = null;
let selectedTab = 'overview'; // 当前详情标签

// DOM元素
const captureBtn = document.getElementById('capture-btn');
const pauseBtn = document.getElementById('pause-btn');
const clearBtn = document.getElementById('clear-btn');
const exportBtn = document.getElementById('export-btn');
const filterInput = document.getElementById('filter');
const methodFilter = document.getElementById('method-filter');
const requestList = document.getElementById('request-list');

// 从存储中加载数据
chrome.storage.local.get(['capturedRequests', 'isCapturing'], (result) => {
  capturedRequests = result.capturedRequests || [];
  isCapturing = result.isCapturing || false;
  
  updateCaptureState();
  renderRequests();
});

// 开始捕获
captureBtn.addEventListener('click', () => {
  isCapturing = true;
  updateCaptureState();
  
  chrome.runtime.sendMessage({ action: 'startCapture' });
  chrome.storage.local.set({ isCapturing: true });
});

// 暂停捕获
pauseBtn.addEventListener('click', () => {
  isCapturing = false;
  updateCaptureState();
  
  chrome.runtime.sendMessage({ action: 'stopCapture' });
  chrome.storage.local.set({ isCapturing: false });
});

// 清空列表
clearBtn.addEventListener('click', () => {
  capturedRequests = [];
  selectedRequestId = null;
  renderRequests();
  
  chrome.storage.local.set({ capturedRequests: [] });
  chrome.runtime.sendMessage({ action: 'clearRequests' });
});

// 导出数据
exportBtn.addEventListener('click', () => {
  const dataStr = JSON.stringify(capturedRequests, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `requests_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
});

// 过滤请求
filterInput.addEventListener('input', renderRequests);
methodFilter.addEventListener('change', renderRequests);

// 列表区域统一事件委托：请求项点击 / 标签切换 / 复制按钮
requestList.addEventListener('click', (event) => {
  const copyBtn = event.target.closest('.detail-copy-btn');
  if (copyBtn) {
    const panel = copyBtn.closest('.detail-panel');
    const requestId = panel && panel.dataset.id;
    const request = capturedRequests.find(req => req && req.id === requestId);
    if (request) {
      const text = safeToString(request.url);
      copyTextToClipboard(text);
      copyBtn.textContent = '已复制';
      setTimeout(() => {
        copyBtn.textContent = '复制请求地址';
      }, 1500);
    }
    return;
  }

  const tabEl = event.target.closest('.detail-tab');
  if (tabEl) {
    selectedTab = tabEl.dataset.tab || 'overview';
    renderRequests();
    return;
  }

  const item = event.target.closest('.request-item');
  if (item) {
    const requestId = item.dataset.id;
    if (requestId) {
      if (selectedRequestId === requestId) {
        // 再次点击同一条请求时，收起详情
        selectedRequestId = null;
      } else {
        // 点击其它请求时，展开该请求详情，并重置为概览标签
        selectedRequestId = requestId;
        selectedTab = 'overview';
      }
      renderRequests();
    }
  }
});

// 更新捕获状态显示
function updateCaptureState() {
  captureBtn.textContent = isCapturing ? '正在捕获...' : '开始捕获';
  captureBtn.disabled = isCapturing;
  pauseBtn.disabled = !isCapturing;
}

// 安全的字符串转换函数
function safeToString(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

// 通用复制函数，封装剪贴板逻辑
function copyTextToClipboard(text) {
  if (!text) {
    return;
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => {
      fallbackCopyText(text);
    });
  } else {
    fallbackCopyText(text);
  }
}

// 备用复制实现
function fallbackCopyText(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
  } catch (e) {
    console.warn('复制到剪贴板失败:', e);
  }
  document.body.removeChild(textarea);
}

// 渲染请求列表
function renderRequests() {
  const filterText = safeToString(filterInput.value).toLowerCase();
  const methodFilterValue = methodFilter.value;
  
  // 过滤请求 - 添加安全检查
  const filteredRequests = capturedRequests.filter(request => {
    // 确保request和request.url存在
    if (!request || !request.url) {
      return false;
    }
    
    const url = safeToString(request.url).toLowerCase();
    const method = safeToString(request.method);
    
    const matchesText = url.includes(filterText);
    const matchesMethod = !methodFilterValue || method === methodFilterValue;
    
    return matchesText && matchesMethod;
  });
  
  if (filteredRequests.length === 0) {
    requestList.innerHTML = '<div class="empty-state">暂无捕获的请求</div>';
    return;
  }

  const htmlParts = filteredRequests.map(request => {
    // 确保请求数据完整
    const method = safeToString(request.method);
    const url = safeToString(request.url);
    const status = request.status;
    let html = `
      <div class="request-item ${request.id === selectedRequestId ? 'active' : ''}" data-id="${request.id}">
        <span class="method ${method}">${method}</span>
        <span class="url">${url}</span>
        ${status ? `<span class="status status-${Math.floor(status/100)}xx">${status}</span>` : ''}
      </div>
    `;

    if (request.id === selectedRequestId) {
      html += renderDetailPanel(request);
    }

    return html;
  });

  requestList.innerHTML = htmlParts.join('');
}

// 渲染概览标签内容
function renderOverview(request) {
  const method = safeToString(request.method);
  const url = safeToString(request.url);
  const type = safeToString(request.type);
  const status = request.status || 'N/A';
  const timestamp = request.timestamp ? new Date(request.timestamp).toLocaleString() : 'N/A';
  const id = safeToString(request.id);
  
  let headersCount = 'N/A';
  let paramsCount = 'N/A';
  let responseHeadersCount = 'N/A';
  
  if (request.requestHeaders && typeof request.requestHeaders === 'object') {
    headersCount = Object.keys(request.requestHeaders).length;
  }
  
  if (request.requestParams && typeof request.requestParams === 'object') {
    paramsCount = Object.keys(request.requestParams).length;
  }
  
  if (request.responseHeaders && typeof request.responseHeaders === 'object') {
    responseHeadersCount = Object.keys(request.responseHeaders).length;
  }

  const statusBadge = request.status
    ? `<span class="status status-${Math.floor(status / 100)}xx overview-status-tag">${status}</span>`
    : '';

  return `
    <div class="request-info">
      <div class="request-line">
        <span class="method ${method} overview-method-tag">${method}</span>
        <span class="overview-url-text">${url}</span>
        ${statusBadge}
      </div>
      <div class="overview-meta-row">
        <div class="overview-meta-item">
          <span class="overview-meta-label">类型</span>
          <span class="overview-meta-value">${type}</span>
        </div>
        <div class="overview-meta-item">
          <span class="overview-meta-label">状态码</span>
          <span class="overview-meta-value">${status}</span>
        </div>
      </div>
      <div class="overview-meta-row">
        <div class="overview-meta-item overview-meta-wide">
          <span class="overview-meta-label">时间</span>
          <span class="overview-meta-value">${timestamp}</span>
        </div>
        <div class="overview-meta-item">
          <span class="overview-meta-label">请求ID</span>
          <span class="overview-meta-value">${id}</span>
        </div>
      </div>
      <div class="overview-count-row">
        <div class="overview-count-badge">请求头：${headersCount}</div>
        <div class="overview-count-badge">参数：${paramsCount}</div>
        <div class="overview-count-badge">响应头：${responseHeadersCount}</div>
      </div>
    </div>
  `;
}

// 渲染请求头标签内容
function renderHeaders(request) {
  if (!request.requestHeaders || typeof request.requestHeaders !== 'object') {
    return '无请求头信息';
  }
  
  const headers = Object.entries(request.requestHeaders);
  if (headers.length === 0) {
    return '无请求头信息';
  }
  
  return headers
    .map(([key, value]) => {
      const safeKey = safeToString(key);
      const safeValue = safeToString(value);
      return `<div class="header-item"><span class="header-key">${safeKey}:</span> ${safeValue}</div>`;
    })
    .join('');
}

// 渲染请求参数标签内容
function renderParams(request) {
  if (!request.requestParams) {
    return '无请求参数';
  }
  
  if (typeof request.requestParams === 'string') {
    return request.requestParams;
  }
  
  if (typeof request.requestParams === 'object') {
    const params = Object.entries(request.requestParams);
    if (params.length === 0) {
      return '无请求参数';
    }
    
    return params
      .map(([key, value]) => {
        const safeKey = safeToString(key);
        const safeValue = safeToString(value);
        return `<div class="param-item"><span class="param-key">${safeKey}:</span> ${safeValue}</div>`;
      })
      .join('');
  }
  
  return '无法解析的请求参数';
}

// 渲染响应标签内容
function renderResponse(request) {
  let content = '';
  
  if (request.responseHeaders && typeof request.responseHeaders === 'object') {
    const responseHeaders = Object.entries(request.responseHeaders);
    if (responseHeaders.length > 0) {
      content += '<h4>响应头:</h4>' + responseHeaders
        .map(([key, value]) => {
          const safeKey = safeToString(key);
          const safeValue = safeToString(value);
          return `<div class="header-item"><span class="header-key">${safeKey}:</span> ${safeValue}</div>`;
        })
        .join('');
    }
  }
  
  if (request.responseBody) {
    content += '<h4>响应体:</h4>' + (typeof request.responseBody === 'string' 
      ? request.responseBody 
      : JSON.stringify(request.responseBody, null, 2));
  }
  
  return content || '无响应信息';
}

// 构建内联详情面板 HTML，紧挨选中请求
function renderDetailPanel(request) {
  const tabLabels = {
    overview: '概览',
    headers: '请求头',
    params: '请求参数',
    response: '响应'
  };

  const tabs = ['overview', 'headers', 'params', 'response'];
  const tabsHtml = tabs.map(tab => `
      <div class="detail-tab ${selectedTab === tab ? 'active' : ''}" data-tab="${tab}">
        ${tabLabels[tab]}
      </div>
    `).join('');

  const content = getDetailContentHtml(request, selectedTab);

  return `
    <div class="detail-panel" data-id="${request.id}">
      <div class="detail-header">
        <button class="detail-copy-btn" data-id="${request.id}">复制请求地址</button>
      </div>
      <div class="detail-tabs">
        ${tabsHtml}
      </div>
      <div class="detail-content">
        ${content}
      </div>
    </div>
  `;
}

// 根据当前标签获取详情内容 HTML
function getDetailContentHtml(request, tab) {
  switch (tab) {
    case 'headers':
      return renderHeaders(request);
    case 'params':
      return renderParams(request);
    case 'response':
      return renderResponse(request);
    case 'overview':
    default:
      return renderOverview(request);
  }
}

// 将请求对象格式化为可复制的纯文本（根据当前标签）
function formatRequestForCopy(request, tab) {
  const method = safeToString(request.method);
  const url = safeToString(request.url);
  const status = request.status || 'N/A';
  const timestamp = request.timestamp ? new Date(request.timestamp).toLocaleString() : 'N/A';

  switch (tab) {
    case 'headers':
      return formatHeadersForCopy(request);
    case 'params':
      return formatParamsForCopy(request);
    case 'response':
      return formatResponseForCopy(request);
    case 'overview':
    default:
      return [
        `${method} ${url}`,
        `状态码: ${status}`,
        `时间: ${timestamp}`
      ].join('\n');
  }
}

function formatHeadersForCopy(request) {
  if (!request.requestHeaders || typeof request.requestHeaders !== 'object') {
    return '无请求头信息';
  }
  const headers = Object.entries(request.requestHeaders);
  if (headers.length === 0) {
    return '无请求头信息';
  }
  return headers
    .map(([key, value]) => `${safeToString(key)}: ${safeToString(value)}`)
    .join('\n');
}

function formatParamsForCopy(request) {
  if (!request.requestParams) {
    return '无请求参数';
  }

  if (typeof request.requestParams === 'string') {
    return request.requestParams;
  }

  if (typeof request.requestParams === 'object') {
    const params = Object.entries(request.requestParams);
    if (params.length === 0) {
      return '无请求参数';
    }
    return params
      .map(([key, value]) => `${safeToString(key)}: ${safeToString(value)}`)
      .join('\n');
  }

  return '无法解析的请求参数';
}

function formatResponseForCopy(request) {
  const parts = [];

  if (request.responseHeaders && typeof request.responseHeaders === 'object') {
    const headers = Object.entries(request.responseHeaders);
    if (headers.length > 0) {
      parts.push('[响应头]');
      parts.push(
        headers
          .map(([key, value]) => `${safeToString(key)}: ${safeToString(value)}`)
          .join('\n')
      );
    }
  }

  if (request.responseBody) {
    parts.push('[响应体]');
    if (typeof request.responseBody === 'string') {
      parts.push(request.responseBody);
    } else {
      parts.push(JSON.stringify(request.responseBody, null, 2));
    }
  }

  return parts.join('\n\n') || '无响应信息';
}

// 监听来自background script的新请求
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'newRequest') {
    // 安全检查：确保请求对象存在且有ID
    if (!message.request || !message.request.id) {
      console.warn('收到无效的请求数据:', message.request);
      return;
    }
    
    // 检查是否已存在相同ID的请求
    const existingIndex = capturedRequests.findIndex(req => req && req.id === message.request.id);
    
    if (existingIndex >= 0) {
      // 更新现有请求（例如添加响应信息）
      capturedRequests[existingIndex] = { 
        ...capturedRequests[existingIndex], 
        ...message.request 
      };
    } else {
      // 添加新请求
      capturedRequests.unshift(message.request);
    }
    
    // 清理可能为null或undefined的请求
    capturedRequests = capturedRequests.filter(req => req !== null && req !== undefined);
    
    // 限制存储的请求数量，避免内存问题
    if (capturedRequests.length > 200) {
      capturedRequests = capturedRequests.slice(0, 200);
    }
    
    // 保存到存储
    chrome.storage.local.set({ capturedRequests });
    
    // 如果弹窗打开且正在捕获，则更新显示
    if (isCapturing) {
      renderRequests();
    }
  }
});
