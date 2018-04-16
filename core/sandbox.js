function chooseSaveToDirectory(dirName) {
    if (!$window.chrome || !chrome.fileSystem || !chrome.fileSystem.chooseEntry) {
        return qSync.reject()
    }
    var deferred = $q.defer()

    chrome.fileSystem.chooseEntry({
        type: 'openDirectory',
        suggestedName: dirName
    }, function(chosenDirectory) {
        deferred.resolve(chosenDirectory)
    })

    return deferred.promise
}

function downloadPhoto(photoID) {
    var photo = photos[photoID]
    var ext = 'jpg'
    var mimeType = 'image/jpeg'
    var fileName = 'photo' + photoID + '.' + ext
    var fullWidth = Math.max(screen.width || 0, $(window).width() - 36, 800)
    var fullHeight = Math.max(screen.height || 0, $(window).height() - 150, 800)
    var fullPhotoSize = choosePhotoSize(photo, fullWidth, fullHeight)
    var inputFileLocation = {
        _: 'inputFileLocation',
        volume_id: fullPhotoSize.location.volume_id,
        local_id: fullPhotoSize.location.local_id,
        secret: fullPhotoSize.location.secret
    }

    FileManager.chooseSave(fileName, ext, mimeType).then(function(writableFileEntry) {
        if (writableFileEntry) {
            MtpApiFileManager.downloadFile(
                fullPhotoSize.location.dc_id, inputFileLocation, fullPhotoSize.size, {
                    mime: mimeType,
                    toFileEntry: writableFileEntry
                }).then(function() {
                // console.log('file save done')
            }, function(e) {
                console.log('photo download failed', e)
            })
        }
    }, function() {
        var cachedBlob = MtpApiFileManager.getCachedFile(inputFileLocation)
        if (cachedBlob) {
            return FileManager.download(cachedBlob, mimeType, fileName)
        }

        MtpApiFileManager.downloadFile(
            fullPhotoSize.location.dc_id, inputFileLocation, fullPhotoSize.size, {
                mime: mimeType
            }
        ).then(function(blob) {
            FileManager.download(blob, mimeType, fileName)
        }, function(e) {
            console.log('photo download failed', e)
        })
    })
}

photoSizePreference = 'full' || 'screenSize' || ''
angular.forEach(photo.sizes, function(photoSize) {}