function inject_script(script_name) {
    var s = document.createElement('script');
    s.src = chrome.extension.getURL(script_name);
    (document.head || document.documentElement).appendChild(s);
}

inject_script('core/generic_tools.js')
inject_script('core/inject.js')
console.log("script injected.")

document.addEventListener('from_injected', function(e) {
    chrome['runtime'].sendMessage({
        detail: e.detail
    }, null);
});

dateFormat = null
pageLimit = null

chrome['runtime'].onMessage.addListener(function(request_msg, sender, sendResponse) {
    console.log('content script received request ' + request_msg.text)
    if (request_msg.text === 'stch_check_conn') {
        dateFormat = request_msg.dateFormat,
            pageLimit = request_msg.pageLimit
    }
    document.dispatchEvent(new CustomEvent('to_injected_status', {}))
    if (request_msg.text === 'stch_check_conn') {
        sendResponse({
            text: "OK"
        })
    }
    if (request_msg.text === 'stch_load_current_history') {
        document.dispatchEvent(new CustomEvent('to_injected_current', {
            'detail': {
                dateFormat: dateFormat,
                pageLimit: pageLimit,
                pageNo: request_msg.pageNo,
            }
        }));
    }
    if (request_msg.text === 'stch_load_more_history') {
        document.dispatchEvent(new CustomEvent('to_injected_get_more', {
            'detail': {
                value: request_msg.value,
                dateFormat: dateFormat,
                pageLimit: pageLimit,
                pageNo: request_msg.pageNo,
            }
        }));
    }
    if (request_msg.text === 'stch_open_photos') {
        document.dispatchEvent(new CustomEvent('to_injected_open_photos', {
            'detail': request_msg.value
        }));
    }
});