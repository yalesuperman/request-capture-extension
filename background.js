// 存储捕获的请求
let capturedRequests = [];
let isCapturing = false;

// 从存储加载数据
chrome.storage.local.get(['capturedRequests', 'isCapturing'], (result) => {
  capturedRequests = result.capturedRequests || [];
  isCapturing = result.isCapturing || false;
  
  if (isCapturing) {
    startCapture();
  }
});

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'startCapture':
      isCapturing = true;
      startCapture();
      break;
      
    case 'stopCapture':
      isCapturing = false;
      stopCapture();
      break;
      
    case 'clearRequests':
      capturedRequests = [];
      chrome.storage.local.set({ capturedRequests: [] });
      break;
  }
});

// 开始捕获请求
function startCapture() {
  // 清除之前的监听器
  stopCapture();
  
  // 添加请求监听器
  chrome.webRequest.onBeforeRequest.addListener(
    onBeforeRequest,
    { urls: ["<all_urls>"] },
    ["requestBody"]
  );
  
  chrome.webRequest.onBeforeSendHeaders.addListener(
    onBeforeSendHeaders,
    { urls: ["<all_urls>"] },
    ["requestHeaders"]
  );
  
  chrome.webRequest.onCompleted.addListener(
    onCompleted,
    { urls: ["<all_urls>"] },
    ["responseHeaders"]
  );
  
  console.log('开始捕获网络请求...');
}

// 停止捕获请求
function stopCapture() {
  chrome.webRequest.onBeforeRequest.removeListener(onBeforeRequest);
  chrome.webRequest.onBeforeSendHeaders.removeListener(onBeforeSendHeaders);
  chrome.webRequest.onCompleted.removeListener(onCompleted);
  
  console.log('停止捕获网络请求');
}

// 请求开始时的回调
function onBeforeRequest(details) {
  if (!isCapturing) return;
  
  // 确保details对象存在
  if (!details) return;
  
  const request = {
    id: details.requestId || generateId(),
    url: details.url || '未知URL',
    method: details.method || 'GET',
    timestamp: details.timeStamp || Date.now(),
    type: details.type || 'other',
    requestParams: extractRequestParams(details)
  };
  
  // 发送到popup
  sendToPopup(request);
}

// 请求发送头时的回调
function onBeforeSendHeaders(details) {
  if (!isCapturing) return;
  if (!details) return;
  
  const requestHeaders = {};
  if (details.requestHeaders && Array.isArray(details.requestHeaders)) {
    details.requestHeaders.forEach(header => {
      if (header && header.name) {
        requestHeaders[header.name] = header.value || '';
      }
    });
  }
  
  const request = {
    id: details.requestId || generateId(),
    requestHeaders: requestHeaders
  };
  
  // 发送到popup
  sendToPopup(request);
}

// 请求完成时的回调
function onCompleted(details) {
  if (!isCapturing) return;
  if (!details) return;
  
  const responseHeaders = {};
  if (details.responseHeaders && Array.isArray(details.responseHeaders)) {
    details.responseHeaders.forEach(header => {
      if (header && header.name) {
        responseHeaders[header.name] = header.value || '';
      }
    });
  }
  
  const request = {
    id: details.requestId || generateId(),
    status: details.statusCode || 0,
    responseHeaders: responseHeaders,
    timestamp: details.timeStamp || Date.now()
  };
  
  // 发送到popup
  sendToPopup(request);
}

// 提取请求参数
function extractRequestParams(details) {
  if (!details) return null;
  
  if (details.requestBody) {
    // 处理表单数据
    if (details.requestBody.formData && typeof details.requestBody.formData === 'object') {
      return details.requestBody.formData;
    }
    
    // 处理JSON数据
    if (details.requestBody.raw && Array.isArray(details.requestBody.raw)) {
      try {
        const rawData = details.requestBody.raw[0];
        if (rawData && rawData.bytes) {
          const decoder = new TextDecoder('utf-8');
          const jsonString = decoder.decode(rawData.bytes);
          return JSON.parse(jsonString);
        }
      } catch (e) {
        // 如果不是JSON，返回原始数据
        try {
          const rawData = details.requestBody.raw[0];
          if (rawData && rawData.bytes) {
            const decoder = new TextDecoder('utf-8');
            return decoder.decode(rawData.bytes);
          }
        } catch (e2) {
          return '二进制数据';
        }
      }
    }
  }
  
  // 从URL提取查询参数
  try {
    if (details.url) {
      const url = new URL(details.url);
      const params = {};
      url.searchParams.forEach((value, key) => {
        params[key] = value;
      });
      return Object.keys(params).length > 0 ? params : null;
    }
  } catch (e) {
    // URL解析失败
    return null;
  }
  
  return null;
}

// 生成唯一ID（备用）
function generateId() {
  return 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// 发送请求数据到popup
function sendToPopup(request) {
  if (!request || !request.id) {
    console.warn('尝试发送无效的请求:', request);
    return;
  }
  
  chrome.runtime.sendMessage({
    action: 'newRequest',
    request: request
  }).catch((error) => {
    // 忽略错误（popup未打开时）
    console.log('Popup未打开，无法发送消息:', error);
  });
}