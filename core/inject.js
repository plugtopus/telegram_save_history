var timeOutWaitForHistory = 200

var limit1 = 20

var myID = 0

var historyForPeerID
var peerIDs
var historyMessages
var maxID
var countMessages
var photo_ids
var photosData

var Ready

var dateFormat
var updateDateBeforeSending
var pageNo
var pageLimit

function notify_status() {
    document.dispatchEvent(new CustomEvent('from_injected', {
        detail: {
            status: (Ready ? 'ready' : 'working'),
        }
    }))
}

function setReady(ready) {
    if (Ready != ready) {
        Ready = ready
        notify_status()
    }
}

function clear() {
    historyForPeerID = 0
    peerIDs = {}
    historyMessages = []
    maxID = 0
    countMessages = -1
    photo_ids = []
    photosData = []
    updateDateBeforeSending = false
    setReady(true)
    pageNo = 1
    console.log('cleared')
}

function storeMessage(messageDateAsNumber, messageDate, messageSender, messageTxt, messageMetaInfo, hiddenInfo,
                      fwdMessageDateAsNumber, fwdMessageDate, fwdSender) {
    historyMessages.push({
        type: 'msg',
        date_number: messageDateAsNumber,
        date: messageDate,
        sender: messageSender,
        text: messageTxt,
        metainfo: messageMetaInfo,
        hiddeninfo: hiddenInfo,
        fwd_date_number: fwdMessageDateAsNumber,
        fwd_date: fwdMessageDate,
        fwd_sender: fwdSender,
    })
}

function storeServiceMessage(messageDateAsNumber, messageDate, messageSender, messageText, hiddenInfo) {
    historyMessages.push({
        type: 'service',
        date_number: messageDateAsNumber,
        date: messageDate,
        sender: messageSender,
        text: messageText,
        hiddeninfo: hiddenInfo,
    })
}

function sendHistory() {
    if (updateDateBeforeSending) {
        for (var i = 0; i < historyMessages.length; i++) {
            historyMessages[i].date = formatDate(new Date(historyMessages[i].date_number * 1000), dateFormat)
            if (historyMessages[i].fwd_date_number > 0) {
                historyMessages[i].fwd_date = formatDate(new Date(historyMessages[i].fwd_date_number * 1000), dateFormat)
            }
        }
        updateDateBeforeSending = false
    }
    var pages = 0
    var historyMessagesView = null
    if (pageLimit <= 0) {
        pages = 1
        pageNo = 1
        historyMessagesView = historyMessages
    } else {
        pages = ~~(historyMessages.length / pageLimit)
        if (pages * pageLimit < historyMessages.length) {
            pages += 1
        }
        pageNo = Math.min(pageNo, pages)
        historyMessagesView = historyMessages.slice(
            (pageNo - 1) * pageLimit, pageNo * pageLimit)
    }
    var firstMessageDate = 'not available'
    if (historyMessages.length > 0) {
        firstMessageDate = historyMessages[historyMessages.length - 1].date
    }
    console.log('message view has ' + historyMessagesView.length + ' messages')
    document.dispatchEvent(new CustomEvent('from_injected', {
        detail: {
            myID: myID,
            peerID: historyForPeerID,
            historyMessages: historyMessagesView,
            firstMessageDate: historyMessages[historyMessages.length - 1].date,
            peerIDs: peerIDs,
            countMessages: countMessages,
            countMessagesFetched: historyMessages.length,
            countPhotos: photosData && photosData.count ? photosData.count : 0,
            pages: pages,
            pageNo: pageNo,
        }
    }))
    setReady(true)
}

function getPhotosData(AppPhotMng, userID) {
    AppPhotMng.getUserPhotos(userID, 0, 0).then(function(photos) {
        photosData = photos
        console.log('found ' + photos.count + ' photos with peer_id=' + userID)
    })
}

function updateCache_PeerFullName(userID, AppUsrMng) {
    if (!(userID in peerIDs)) {
        var userObject = AppUsrMng.getUser(userID)
        if (userObject.deleted || (userObject.pFlags && userObject.pFlags.deleted)) {
            peerIDs[userID] = 'DELETED'
        } else {
            peerIDs[userID] = userObject.first_name +
                (userObject.last_name ? " " + userObject.last_name : "") +
                (userObject.username ? " [@" + userObject.username + "]" : "")
        }
    }
}

function updateCache_PeerGroupTitle(peerID, AppChatsMng) {
    if (!(peerID in peerIDs)) {
        var groupObject = AppChatsMng.getChat(-peerID)
        peerIDs[peerID] = groupObject.title +
            (groupObject.username ? " [@" + groupObject.username + "]" : "")
    }
}

function processGetHistoryResponse(peerID, res, AppMesMng, AppUsrMng, AppChatsMng, AppPhotMng, time1) {
    if (res.$$state.status == 1) {
        if (historyForPeerID != peerID) {
            clear()
            historyForPeerID = peerID
            if (historyForPeerID >= 0) {
                getPhotosData(AppPhotMng, historyForPeerID)
                updateCache_PeerFullName(historyForPeerID, AppUsrMng)
            } else { //it is a group
                updateCache_PeerGroupTitle(historyForPeerID, AppChatsMng)
            }
        }
        if (countMessages == -1) {
            countMessages = res.$$state.value.count
            console.log("messages to fetch = " + countMessages)
        }
        var messageIDs = res.$$state.value.history
        var time2 = new Date().getTime()
        for (var i = 0; i < messageIDs.length; i++) {
            var msgWrap = AppMesMng.wrapForHistory(messageIDs[i])
            var msgHiddenInfo = {
                msg_id: messageIDs[i]
            }
            var msgDate = formatDate(new Date(msgWrap.date * 1000), dateFormat)
            var msgSender = msgWrap.fromID || msgWrap.from_id
            updateCache_PeerFullName(msgSender, AppUsrMng)
            if (msgWrap._ == 'messageService') {
                var msgServiceText = ''
                switch (msgWrap.action._) {
                    case 'messageActionChatCreate':
                        msgServiceText = 'created the group "' + (msgWrap.action.title || '') + '"'
                        break
                    case 'messageActionChannelCreate':
                        msgServiceText = 'channel created'
                        break
                    case 'messageActionChannelMigrateFrom':
                        msgServiceText = 'upgraded the group to a supergroup'
                        break
                    case 'messageActionChatAddUser': //invited {users.name....}
                        msgServiceText = 'invited '
                        for (var iuser = 0; iuser < msgWrap.action.users.length; iuser++) {
                            var invited_uid = msgWrap.action.users[iuser]
                            updateCache_PeerFullName(invited_uid, AppUsrMng)
                            if (iuser == 0)
                                msgServiceText += peerIDs[invited_uid]
                            else
                                msgServiceText += ', ' + peerIDs[invited_uid]
                        }
                        break
                    case 'messageActionChatJoined':
                        msgServiceText = 'joined the group'
                        break
                    case 'messageActionChatLeave':
                        msgServiceText = 'left the group'
                        break
                    case 'messageActionChatDeleteUser':
                        var removed_uid = msgWrap.action.user_id
                        updateCache_PeerFullName(removed_uid, AppUsrMng)
                        msgServiceText = 'removed ' + peerIDs[removed_uid]
                        break
                    case 'messageActionChatEditTitle':
                        msgServiceText = 'changed group name to "' + (msgWrap.action.title || '') + '"'
                        break
                    case 'messageActionChatEditPhoto':
                        msgServiceText = 'changed group photo'
                        break
                    case 'messageActionChannelEditPhoto':
                        msgServiceText = 'channel photo updated'
                        break
                    case 'messageActionChatDeletePhoto':
                        msgServiceText = 'removed group photo'
                        break
                    case 'messageActionPhoneCall':
                        switch (msgWrap.action.type) {
                            case 'in_ok':
                                msgServiceText = 'incoming call ' + formatCallDuration(msgWrap.action.duration)
                                break
                            case 'out_ok':
                                msgServiceText = 'outgoing call ' + formatCallDuration(msgWrap.action.duration)
                                break
                            case 'in_missed':
                                msgServiceText = 'missed call'
                                break
                            case 'out_missed':
                                msgServiceText = 'cancelled call'
                                break
                            default:
                                msgServiceText = 'unknown phone call action type: ' + msgWrap.action.type
                        }
                        break
                    default:
                        msgServiceText = 'unsupported service message type: ' + msgWrap.action._
                }
                storeServiceMessage(msgWrap.date, msgDate, msgSender, '>>' + msgServiceText + '<<', msgHiddenInfo)
                continue
            }

            var msgTxt = msgWrap.message
            var msgMetaInfo = ''
            var fwdMessageDateAsNumber = 0
            var fwdMessageDate = ''
            var fwdSender = ''
            if (msgWrap.fwd_from) {
                fwdMessageDateAsNumber = msgWrap.fwd_from.date
                fwdMessageDate = formatDate(new Date(msgWrap.fwd_from.date * 1000), dateFormat)
                fwdSender = msgWrap.fwd_from.from_id
                updateCache_PeerFullName(fwdSender, AppUsrMng)
            }
            if (msgWrap.media) {
                console.log('found ' + msgWrap.media._ + ' media type of the message, date = ' + msgDate)
                switch (msgWrap.media._) {
                    case 'messageMediaPhoto':
                        var photoId = msgWrap.media.photo.id
                        photo_ids.push({
                            photo_id: photoId,
                            message_id: messageIDs[i]
                        })
                        msgHiddenInfo.photo_id = photoId
                        msgMetaInfo = 'Photo'
                        msgTxt = msgWrap.media.caption
                        break
                    case 'messageMediaDocument':
                        switch (msgWrap.media.document.mime_type) {
                            case 'audio/ogg':
                                if (msgWrap.media.document.type == 'voice') {
                                    msgMetaInfo = 'Voice Message'
                                } else {
                                    msgMetaInfo = 'Audio'
                                }
                                var secs = msgWrap.media.document.duration
                                if (secs) {
                                    msgMetaInfo += ','
                                    var mins = Math.floor(secs / 60)
                                    var rem_secs = secs % 60
                                    if (mins > 0)
                                        msgMetaInfo += " " + mins + "min"
                                    msgMetaInfo += " " + rem_secs + "sec"
                                }
                                break
                            case 'video/mp4':
                                if (msgWrap.media.document.type == "gif") {
                                    msgMetaInfo = 'GIF'
                                } else {
                                    msgMetaInfo = 'Video'
                                }
                                break
                            case 'application/octet-stream':
                                msgMetaInfo = 'File "' + msgWrap.media.document.file_name + '"'
                                break
                            default:
                                msgMetaInfo = 'Document'
                        }
                        if (msgWrap.media.document.type == "sticker") {
                            msgMetaInfo = msgWrap.media.document.stickerEmojiRaw + ' Sticker'
                        }
                        if (msgWrap.media.document.size) {
                            msgMetaInfo += ', size ' + friendlySize(msgWrap.media.document.size) + ' bytes'
                        }
                        break
                    case 'messageMediaGeo':
                        msgMetaInfo = 'Geo Lat/Long = ' + msgWrap.media.geo.lat + ', ' + msgWrap.media.geo.long
                        break

                    case 'messageMediaVenue':
                        msgMetaInfo = 'Venue'
                        break

                    case 'messageMediaContact':
                        msgMetaInfo = 'Contact: ' + msgWrap.media.first_name +
                            ' ' + msgWrap.media.last_name +
                            ' ' + msgWrap.media.phone_number
                        break

                    case 'messageMediaWebPage':
                        msgMetaInfo = 'Webpage'
                        break

                    default:
                        msgMetaInfo = '?' + msgWrap.media._
                        console.log('found unknown type of media: ' + msgWrap.media._)
                }
            }
            storeMessage(msgWrap.date, msgDate, msgSender, msgTxt, msgMetaInfo, msgHiddenInfo,
                fwdMessageDateAsNumber, fwdMessageDate, fwdSender)
        }
        maxID = messageIDs[messageIDs.length - 1]
        console.log("fetched " + messageIDs.length + " messages in " +
            (time2 - time1) / 1000.0 + " sec.")
        console.log("Total progress: " +
            Math.floor(100 * historyMessages.length / countMessages) +
            " %")
        sendHistory()
    } else {
        setTimeout(function() {
            processGetHistoryResponse(peerID, res,
                AppMesMng, AppUsrMng, AppChatsMng, AppPhotMng, time1)
        }, timeOutWaitForHistory);
    }
}

function handleMoreHistoryRequest(limit) {
    setReady(false)
    var injector = angular.element(document).injector()
    var AppMesManager = injector.get('AppMessagesManager')
    var AppUsrManager = injector.get('AppUsersManager')
    var AppChatsManager = injector.get('AppChatsManager')
    var AppPhotManager = injector.get('AppPhotosManager')
    var iRootScope = injector.get('$rootScope')
    var peerID = iRootScope.selectedPeerID

    if (peerID == 0) {
        console.log('it seems a peer was not chosen.')
        sendHistory()
        return
    }
    console.log("loading history for peerID = " + peerID)
    var time1 = new Date().getTime()

    if (countMessages == -1 || historyMessages.length < countMessages) {
        var res = AppMesManager.getHistory(peerID, maxID, limit)
        processGetHistoryResponse(peerID, res,
            AppMesManager, AppUsrManager, AppChatsManager, AppPhotManager, time1)
    } else {
        sendHistory()
    }
}

function handleCurrentHistoryRequest() {
    var injector = angular.element(document).injector()
    var iRootScope = injector.get('$rootScope')
    var peerID = iRootScope.selectedPeerID
    if (peerID == historyForPeerID) {
        sendHistory()
    } else {
        clear()
        handleMoreHistoryRequest(limit1)
    }
}

function prepare() {
    var injector = angular.element(document).injector()
    var MtpApiManager = injector.get('MtpApiManager')
    MtpApiManager.getUserID().then(function(id) {
        myID = id
    })
    clear()
}

prepare()

document.addEventListener("to_injected_status", function(e) {
    notify_status()
}, false);

function retrieveMetaData(detail) {
    var dateFormatNew = detail.dateFormat
    if (dateFormat != dateFormatNew) {
        dateFormat = dateFormatNew
        updateDateBeforeSending = true
    }
    pageLimit = detail.pageLimit
    pageNo = detail.pageNo
}

document.addEventListener("to_injected_get_more", function(e) {
    if (!Ready)
        return
    retrieveMetaData(e.detail)
    handleMoreHistoryRequest(e.detail.value)
}, false);

document.addEventListener("to_injected_current", function(e) {
    if (!Ready)
        return
    retrieveMetaData(e.detail)
    if (countMessages >= 0)
        handleCurrentHistoryRequest()
    else
        handleMoreHistoryRequest(limit1)
}, false);

document.addEventListener("to_injected_open_photos", function(e) {
    if (!Ready)
        return
    var injector = angular.element(document).injector()
    var AppPhotManager = injector.get('AppPhotosManager')
    if (photo_ids.length > 0) {
        if (e.detail) {
            var str = e.detail.split(",")
            var photoId = str[0]
            var mesId = str[1]
            AppPhotManager.openPhoto(photoId, {
                m: mesId
            })
        } else {
            var pos = 0
            AppPhotManager.openPhoto(photo_ids[pos]['photo_id'], {
                m: photo_ids[pos]['message_id']
            })
        }
    } else {
        console.log('No photos found for current history.')
    }
}, false);