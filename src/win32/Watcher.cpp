#include "../includes/win32/Watcher.h"

#include <sstream>

static std::wstring getWStringFileName(LPWSTR cFileName, DWORD length) {
    return std::wstring(cFileName, length);
}


static std::string convertWideCharToMultiByte(const std::wstring &wideChar)
{
    int utf8length = WideCharToMultiByte(
                CP_UTF8,
                0,
                wideChar.data(),
                -1,
                0,
                0,
                NULL,
                NULL
            );
    std::string utf8String;
    utf8String.resize(utf8length-1);
    int failureToResolveToUTF8 = WideCharToMultiByte(
        CP_UTF8,
        0,
        wideChar.data(),
        -1,
        const_cast<char*>(utf8String.data()),
        static_cast<DWORD>(utf8String.size()),
        NULL,
        NULL
    );

    return utf8String;
}

std::string Watcher::getUTF8Directory(std::wstring path) {
    std::wstring::size_type found = path.rfind('\\');
    std::wstringstream utf16DirectoryStream;

    utf16DirectoryStream << mPath;

    if (found != std::wstring::npos) {
        utf16DirectoryStream
          << "\\"
          << path.substr(0, found);
    }

    return convertWideCharToMultiByte(utf16DirectoryStream.str());
}

static
std::string getUTF8FileName(std::wstring path) {
    std::wstring::size_type found = path.rfind('\\');
    if (found != std::wstring::npos) {
        path = path.substr(found + 1);
    }

    return convertWideCharToMultiByte(path);
}

Watcher::Watcher(std::shared_ptr<EventQueue> queue, HANDLE dirHandle, const std::wstring &path)
    : mRunning(false)
    , mDirectoryHandle(dirHandle)
    , mQueue(queue)
    , mPath(path)
{
    ZeroMemory(&mOverlapped, sizeof(OVERLAPPED));
    mOverlapped.hEvent = this;
    resizeBuffers(1024 * 1024);
    start();
}

Watcher::~Watcher()
{
    stop();
}

void Watcher::resizeBuffers(std::size_t size)
{
    mReadBuffer.resize(size);
    mWriteBuffer.resize(size);
}

void Watcher::run()
{
    while(mRunning) {
        SleepEx(INFINITE, true);
    }
}

bool Watcher::loop()
{
    DWORD bytes = 0;

    if (!isRunning()) {
        return false;
    }

    if (!ReadDirectoryChangesW(
        mDirectoryHandle,
        mWriteBuffer.data(),
        static_cast<DWORD>(mWriteBuffer.size()),
        TRUE,                           //recursive watching
        FILE_NOTIFY_CHANGE_FILE_NAME
        | FILE_NOTIFY_CHANGE_DIR_NAME
        | FILE_NOTIFY_CHANGE_ATTRIBUTES
        | FILE_NOTIFY_CHANGE_SIZE
        | FILE_NOTIFY_CHANGE_LAST_WRITE
        | FILE_NOTIFY_CHANGE_LAST_ACCESS
        | FILE_NOTIFY_CHANGE_CREATION
        | FILE_NOTIFY_CHANGE_SECURITY,
        &bytes,                         //num bytes written
        &mOverlapped,
        [](DWORD errorCode, DWORD numBytes, LPOVERLAPPED overlapped) {
            auto watcher = reinterpret_cast<Watcher*>(overlapped->hEvent);
            watcher->eventCallback(errorCode);
        }))
    {
        setError("Service shutdown unexpectedly");
        return false;
    }

    return true;
}

void Watcher::eventCallback(DWORD errorCode)
{
    if (errorCode != ERROR_SUCCESS) {
        if (errorCode == ERROR_NOTIFY_ENUM_DIR) {
            setError("Buffer filled up and service needs a restart");
        } else if (errorCode == ERROR_INVALID_PARAMETER) {
            // resize the buffers because we're over the network, 64kb is the max buffer size for networked transmission
            resizeBuffers(64 * 1024);

            if (!loop()) {
                setError("failed resizing buffers for network traffic");
            }
        } else {
            setError("Service shutdown unexpectedly");
        }
        return;
    }

    std::swap(mWriteBuffer, mReadBuffer);
    BOOL readRequested = loop();
    handleEvents();

    if (!readRequested) {
        //delete (std::shared_ptr<ReadLoopRunner> *)runner;
    }
}

void Watcher::handleEvents()
{
    BYTE *base = mReadBuffer.data();
    while (true) {
        PFILE_NOTIFY_INFORMATION info = (PFILE_NOTIFY_INFORMATION)base;
        std::wstring fileName = getWStringFileName(info->FileName, info->FileNameLength);

        if (info->Action == FILE_ACTION_RENAMED_OLD_NAME) {
            if (info->NextEntryOffset != 0) {
                base += info->NextEntryOffset;
                info = (PFILE_NOTIFY_INFORMATION)base;
                if (info->Action == FILE_ACTION_RENAMED_NEW_NAME) {
                    std::wstring fileNameNew = getWStringFileName(info->FileName, info->FileNameLength);

                    mQueue->enqueue(
                        RENAMED,
                        getUTF8Directory(fileName),
                        getUTF8FileName(fileName),
                        getUTF8FileName(fileNameNew)
                    );
                } else {
                    mQueue->enqueue(DELETED, getUTF8Directory(fileName), getUTF8FileName(fileName));
                    continue;
                }
            } else {
                mQueue->enqueue(DELETED, getUTF8Directory(fileName), getUTF8FileName(fileName));
                break;
            }
        }

        switch (info->Action) {
        case FILE_ACTION_ADDED:
        case FILE_ACTION_RENAMED_NEW_NAME: // in the case we just receive a new name and no old name in the buffer
            mQueue->enqueue(CREATED, getUTF8Directory(fileName), getUTF8FileName(fileName));
            break;
        case FILE_ACTION_REMOVED:
            mQueue->enqueue(DELETED, getUTF8Directory(fileName), getUTF8FileName(fileName));
            break;
        case FILE_ACTION_MODIFIED:
        default:
            mQueue->enqueue(MODIFIED, getUTF8Directory(fileName), getUTF8FileName(fileName));
        };

        if (info->NextEntryOffset == 0) {
            break;
        }
        base += info->NextEntryOffset;
    }
}

void Watcher::start()
{
    mRunner = std::thread([this]{
        // mRunning is set to false in the d'tor
        mRunning = true;
        run();
    });

    if (!mRunner.joinable()) {
        mRunning = false;
        return;
    }

    QueueUserAPC([](__in ULONG_PTR self) {
        auto watcher = reinterpret_cast<Watcher*>(self);
        watcher->mHasStartedSemaphore.signal();
        watcher->loop();
    } , mRunner.native_handle(), (ULONG_PTR)this);

    if (!mHasStartedSemaphore.waitFor(std::chrono::seconds(10))) {
        setError("Watcher is not started");
    }
}

void Watcher::stop()
{
    mRunning = false;
    QueueUserAPC([](__in ULONG_PTR) {}, mRunner.native_handle(), (ULONG_PTR)this);
    mRunner.join();
}

void Watcher::setError(const std::string &error)
{
    std::lock_guard<std::mutex> lock(mErrorMutex);
    mError = error;
}


std::string Watcher::getError() const
{
    if (!isRunning()) {
        return "Failed to start watcher";
    }

    std::lock_guard<std::mutex> lock(mErrorMutex);
    return mError;
}
