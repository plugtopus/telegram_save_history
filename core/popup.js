msgFormat = null
dateFormat = null
pageLimit = null

first_request = true
connectionOK = false
keep_scrolling = false

min_time_between_requests = 2000

var NL = '\r\n'

defaultTextHint = "To save your telegram chat history, you first need to:" + NL +
    " - visit https://web.telegram.org, login, and" + NL +
    " - select one of your contacts." + NL + NL +
    "If you did it already and still see this message, try to reload the web-page."


defaultTextWait = "Please wait until messages are downloaded." + NL +
    "You may safely close the extension and come back later." + NL +
    "Alternatively, you can reload the web-page (e.g., by pressing F5)." + NL + NL +
    "There might be a blue indicator with text '!' displayed next to the extension icon." + NL +
    "  blue indicator = messages are being downloaded" + NL +
    "  normal icon    = messages have been downloaded and are being rendered into *this* window" + NL


function last_request_time() {
    return chrome['extension'].getBackgroundPage().last_request_time
}

myTextAreaLineNumber = -1

function getLineNumberFromString(str) {
    return str.split(NL).length
}

var ReceivedMsg
var LinesAfterMessages
var FirstDateShown
var LastDateShown

var PeerID
var NamePeer
var CntPhotos

var editor

function initAce() {
    editor = ace.edit("myTextarea")
    editor.setOptions({
        newLineMode: 'auto',
        readOnly: 'true',
        vScrollBarAlwaysVisible: 'false',
    })
    editor.getSession().setUseWrapMode(true)
}

function getAceLineNumber() {
    var pos = editor.getCursorPosition()
    return pos.row
}

function restoreAceState() {
    var scrollTop = chrome['extension'].getBackgroundPage().aceTopScroll
    var curRow = chrome['extension'].getBackgroundPage().aceCurRow
    editor.selection.moveTo(curRow, 0)
    editor.getSession().setScrollTop(scrollTop || 0)
}

function storePageNo(pageNo) {
    chrome['extension'].getBackgroundPage().pageNo = pageNo
}

function storeAceState() {
    scrollTop = editor.renderer.getScrollTop()
    aceCurRow = getAceLineNumber()
    if (scrollTop < 0)
        return
    chrome['extension'].getBackgroundPage().aceCurRow = aceCurRow
    chrome['extension'].getBackgroundPage().aceTopScroll = scrollTop
}

function displayMessages(msgWrap) {
    var msg = msgWrap.detail
    page_control_set_page(msg.pageNo)
    page_control_set_total_pages(msg.pages)

    PeerID = msg.peerID
    if (PeerID == 0) {
        $('#myTextarea').val(defaultTextHint)
        enableButtons(false)
        isShowProgress = false
        return
    }
    NamePeer = msg.peerIDs[msg.peerID]
    var textArea = 'Your Telegram History'
    if (PeerID >= 0) {
        textArea += ' with ' + NamePeer + NL
    } else {
        textArea += ' in "' + NamePeer + '"' + NL
    }
    var messages = msg.historyMessages
    var countMessages = msg.countMessages
    var firstDateShown = messages[messages.length - 1].date_number
    var lastDateShown = messages[0].date_number
    var linesAfterMessages = []
    var receivedMsg = []
    linesAfterMessages.push(getLineNumberFromString(textArea))
    for (var i = msg.historyMessages.length - 1; i >= 0; i--) {
        var msgWrap = messages[i]
        var curDateTimeFormatted = msgWrap.date
        var senderID = msgWrap.sender
        var author = msg.peerIDs[senderID]
        if (senderID == msg.myID) {
            author += "(you)";
        }
        var fwd_senderID = msgWrap.fwd_sender
        var metainfoFwd = ''
        if (fwd_senderID && fwd_senderID != '') {
            var fwd_sender = msg.peerIDs[fwd_senderID]
            var fwd_dateTimeFormatted = msgWrap.fwd_date
            metainfoFwd = '{{FWD: ' + fwd_sender + ', ' + fwd_dateTimeFormatted + '}}' + NL
        }
        var text = msgWrap.text || ''
        var metainfo = msgWrap.metainfo || ''
        if (metainfo && metainfo.length > 0)
            metainfo = '[[' + metainfo + ']]'
        var msgFormatted = ''
        if (msgWrap.type == 'service') {
            msgFormatted += '.....'
        }
        msgFormatted += formatMsg(msgFormat, curDateTimeFormatted, author, metainfoFwd + metainfo + text)
        textArea += NL + msgFormatted
        linesAfterMessages.push(linesAfterMessages[linesAfterMessages.length - 1] + getLineNumberFromString(msgFormatted))
        receivedMsg.push({
            msg_id: messages[i].hiddeninfo.msg_id,
            photo_id: messages[i].hiddeninfo.photo_id
        })
    }
    linesAfterMessages.reverse()
    receivedMsg.reverse()
    editor.setValue(textArea, -1)
    editor.gotoLine(0)
    editor.focus()
    if (first_request) {
        first_request = false
        restoreAceState()
    }
    var elapsedTime = new Date() - last_request_time()
    var logMsg = 'History from ' + msg.firstMessageDate + "." +
        NL + 'Fetched ' + friendlySize(msg.countMessagesFetched) + ' messages out of ' + friendlySize(countMessages) +
        ' (' + Math.floor(100 * messages.length / countMessages) + '%).' +
        NL + 'Shown ' + friendlySize(messages.length) + ' messages' +
        ' from ' + formatDateInt(firstDateShown, dateFormat) +
        ' to ' + formatDateInt(lastDateShown, dateFormat) + '.' +
        NL + 'Size: ' + friendlySize(textArea.length) + ' characters,' +
        ' ' + friendlySize(editor.session.getLength()) + ' lines.' +
        ' Time ' + elapsedTime / 1000.0 + ' sec.'
    console.log(logMsg)
    $('#txtAreaStatus').val(logMsg)
    ReceivedMsg = receivedMsg
    LinesAfterMessages = linesAfterMessages
    FirstDateShown = firstDateShown
    LastDateShown = lastDateShown
    enableButtons(true, msg.countPhotos)
}

function communicate(commandText, value) {
    enableButtons(false)
    var pageNo = page_control_get_pageNo()
    if (commandText.includes('stch_load'))
        storePageNo(pageNo)
    chrome['extension'].getBackgroundPage().last_request_time = new Date()
    console.log("sending " + commandText + " with value=" + value)
    chrome['tabs'].query({
        active: true,
        currentWindow: true
    }, function(tabs) {
        chrome['tabs'].sendMessage(tabs[0].id, {
            text: commandText,
            value: value,
            pageNo: pageNo,
        }, null)
    })
}

function requestCurrentHistory() {
    communicate('stch_load_current_history');
    startProgress()
}

function requestMoreHistory(limit) {
    communicate('stch_load_more_history', limit);
    startProgress()
}

function enableButtons(enable, cntPhotos = 0) {
    $('button').attr('disabled', !enable)
    $('input').attr('disabled', !enable)
    if (enable) {
        isShowProgress = false
    }
    $('#btnClose').attr('disabled', false)
}

var isShowProgress = false

function precision_one_digit(t) {
    return Math.floor(t * 10) / 10
}

function showProgress() {
    var t = new Date().getTime()
    var elapsed_sec = precision_one_digit((t - last_request_time()) / 1000)
    var min = Math.floor(elapsed_sec / 60)
    var sec = precision_one_digit(elapsed_sec - min * 60)
    var str = "" + sec
    if (str.length < 2 || str.charAt(str.length - 2) != '.') {
        str += '.0'
    }
    str += "s"
    if (min > 0) {
        str = min + 'm ' + str
    }
    if (elapsed_sec > 0.99) {
        $('#progressBar').text(str)
    }
    if (isShowProgress) {
        setTimeout(showProgress, 200);
    } else {
        $('#progressBar').text('')
    }
}

function startProgress() {
    isShowProgress = true
    showProgress()
}

function stopProgress() {
    isShowProgress = false
    $('#progressBar').text('')
}

function checkConnection() {
    enableButtons(false)
    console.log("Checking connection with main page.")
    chrome['tabs'].query({
        active: true,
        currentWindow: true
    }, function(tabs) {
        chrome['tabs'].sendMessage(tabs[0].id, {
            text: 'stch_check_conn',
            dateFormat: dateFormat,
            pageLimit: pageLimit
        }, function(response) {
            if (undefined != response) {
                connectionOK = true
                console.log('connection to main page: ok');
                enableButtons(true)
                requestCurrentHistory()
                editor.setValue(defaultTextWait, -1)
            } else {
                connectionOK = false
                console.log('no response from the main tab.');
                editor.setValue(defaultTextHint, -1)
                enableButtons(false)
            }
        })
    });
}

var limitMAX = 200000000

function prepareButton(butId, limit) {
    $('#' + butId).click(function() {
        requestMoreHistory(limit)
    });
}

function openPhoto(sign) {
    myTextAreaLineNumber = getAceLineNumber()
    var idx = binSearch(LinesAfterMessages, myTextAreaLineNumber, function(a, b) {
        return b - a
    })
    if (idx < 0) {
        idx = -idx
    }
    for (var delta = 0; delta < LinesAfterMessages.length; delta++) {
        var check_idx = idx + sign * delta
        if (check_idx >= 0 && check_idx < ReceivedMsg.length) {
            if (ReceivedMsg[check_idx].photo_id != null) {
                var req_value = ReceivedMsg[check_idx].photo_id
                communicate('stch_open_photos', req_value)
                return
            }
        }
    }
    console.log('no open photo requests has been sent')
}

function revokeURL(downloadId) {
    setTimeout(function() {
        chrome.downloads.search({
            id: downloadId
        }, function(downloadItems) {
            if (downloadItems && downloadItems.length == 1) {
                var downloadItem = downloadItems[0]
                if (downloadItem.state == "in_progress") {
                    revokeURL(downloadId)
                } else {
                    window.URL.revokeObjectURL(downloadItem.url)
                }
            }
        })
    }, 5000)
}

function chromeSaveAs(blob, fname) {
    var url = window.URL.createObjectURL(blob)
    chrome.downloads.download({
        url: url,
        filename: fname,
        saveAs: true
    }, function(downloadId) {
        revokeURL(downloadId)
    })
}

function history_date_range() {
    var fmt = 'YMD-Hm'
    return '_from' + formatDateInt(FirstDateShown, fmt) + '_to' + formatDateInt(LastDateShown, fmt)
}

document.addEventListener('DOMContentLoaded', function() {
    chrome.storage.sync.get(defaultFormatSettings, function(items) {
        initAce()
        msgFormat = prepareFormat(items[items['formatSelected']])
        dateFormat = items[items['formatDateSelected']]

        $('#loadHistory .btnLoadGrid').click(function() {
            var s = this.innerText
            if (s == 'all') {
                requestMoreHistory(limitMAX)
            } else {
                s = s.replace('k', '000')
                s = s.replace(' ', '')
                var limit = parseInt(s)
                requestMoreHistory(limit)
            }
        })
        checkConnection()

        pageLimit = items['pageLimit']
        page_control_init('#pageControl', function() {
            requestCurrentHistory()
        })
        page_control_set_page(chrome['extension'].getBackgroundPage().pageNo)

        $('#btnClose').click(function() {
            var daddy = window.self
            daddy.opener = window.self
            daddy.close()
        })
        $('#btnOpenPhotos').click(function() {
            communicate('stch_open_photos')
        })

        $('#btnOpenPrevPhoto').click(function() {
            openPhoto(1)
        })
        $('#btnOpenNextPhoto').click(function() {
            openPhoto(-1)
        })
        $('#btnSaveAs').click(function() {
            var text = editor.getValue()
            var blob = new Blob([text], {
                type: "text/plain;charset=utf-8"
            })
            var dateSave = formatDateForFileName(new Date)
            if (PeerID >= 0) {
                chromeSaveAs(blob, "telegram_chat_history__" + NamePeer + history_date_range() + "__downloaded" + dateSave + ".txt")
            } else {
                chromeSaveAs(blob, "telegram_group_history__" + NamePeer + history_date_range() + "__downloaded" + dateSave + ".txt")
            }
        })

        $('#myTextarea').keyup(function() {
            storeAceState()
        })
        $('#myTextarea').mouseup(function() {
            storeAceState()
        })
        editor.getSession().on('changeScrollTop', function(scroll) {
            storeAceState()
        })
    })
})