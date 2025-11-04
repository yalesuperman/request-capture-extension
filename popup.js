// 存储捕获的请求
let capturedRequests = [];
let isCapturing = false;
let selectedRequestId = null;

// DOM元素
const captureBtn = document.getElementById('capture-btn');
const pauseBtn = document.getElementById('pause-btn');
const clearBtn = document.getElementById('clear-btn');
const exportBtn = document.getElementById('export-btn');
const filterInput = document.getElementById('filter');
const methodFilter = document.getElementById('method-filter');
const requestList = document.getElementById('request-list');
const detailPanel = document.getElementById('detail-panel');
const detailContent = document.getElementById('detail-content');

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
  detailPanel.style.display = 'none';
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

// 标签切换
document.querySelectorAll('.detail-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    // 更新激活的标签
    document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    // 显示对应内容
    const selectedRequest = capturedRequests.find(req => req.id === selectedRequestId);
    if (selectedRequest) {
      showDetailContent(selectedRequest, tab.dataset.tab);
    }
  });
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
  
  requestList.innerHTML = filteredRequests.map(request => {
    // 确保请求数据完整
    const method = safeToString(request.method);
    const url = safeToString(request.url);
    const status = request.status;
    
    return `
      <div class="request-item ${request.id === selectedRequestId ? 'active' : ''}" data-id="${request.id}">
        <span class="method ${method}">${method}</span>
        <span class="url">${url}</span>
        ${status ? `<span class="status status-${Math.floor(status/100)}xx">${status}</span>` : ''}
      </div>
    `;
  }).join('');
  
  // 添加点击事件
  document.querySelectorAll('.request-item').forEach(item => {
    item.addEventListener('click', () => {
      const requestId = item.dataset.id;
      selectedRequestId = requestId;
      renderRequests(); // 重新渲染以更新激活状态
      
      const selectedRequest = capturedRequests.find(req => req.id === requestId);
      if (selectedRequest) {
        showDetailPanel(selectedRequest);
      }
    });
  });
}

// 显示详情面板
function showDetailPanel(request) {
  detailPanel.style.display = 'block';
  showDetailContent(request, 'overview');
}

// 显示详情内容
function showDetailContent(request, tab) {
  let content = '';
  
  switch (tab) {
    case 'overview':
      content = renderOverview(request);
      break;
    case 'headers':
      content = renderHeaders(request);
      break;
    case 'params':
      content = renderParams(request);
      break;
    case 'response':
      content = renderResponse(request);
      break;
  }
  
  detailContent.innerHTML = content;
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
  
  return `
    <div class="request-info">
      <div class="request-line">${method} ${url} HTTP/1.1</div>
      <div><strong>状态码:</strong> ${status}</div>
      <div><strong>类型:</strong> ${type}</div>
      <div><strong>时间:</strong> ${timestamp}</div>
      <div><strong>请求ID:</strong> ${id}</div>
    </div>
    <div><strong>请求头数量:</strong> ${headersCount}</div>
    <div><strong>参数数量:</strong> ${paramsCount}</div>
    <div><strong>响应头数量:</strong> ${responseHeadersCount}</div>
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
      
      // 如果当前选中了请求，更新详情面板
      if (selectedRequestId === message.request.id) {
        const selectedRequest = capturedRequests.find(req => req && req.id === selectedRequestId);
        if (selectedRequest) {
          const activeTab = document.querySelector('.detail-tab.active');
          if (activeTab) {
            showDetailContent(selectedRequest, activeTab.dataset.tab);
          }
        }
      }
    }
  }
});