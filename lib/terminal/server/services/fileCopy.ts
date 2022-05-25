
/* lib/terminal/server/services/fileCopy - A library that stores instructions for copy and cut of file system artifacts. */

import { createHash, Hash } from "crypto";
import { createReadStream, createWriteStream, ReadStream, WriteStream } from "fs";
import { BrotliCompress, BrotliDecompress, constants, createBrotliCompress, createBrotliDecompress } from "zlib";

import common from "../../../common/common.js";
import copy from "../../commands/copy.js";
import deviceMask from "../services/deviceMask.js";
import directory from "../../commands/directory.js";
import error from "../../utilities/error.js";
import fileSystem from "./fileSystem.js";
import hash from "../../commands/hash.js";
import mkdir from "../../commands/mkdir.js";
import remove from "../../commands/remove.js";
import rename from "../../utilities/rename.js";
import sender from "../transmission/sender.js";
import service from "../../test/application/service.js";
import transmit_ws from "../transmission/transmit_ws.js";
import vars from "../../utilities/vars.js";

// cspell:words brotli

/**
 * Stores file copy services.
 * ```typescript
 * interface module_fileCopy {
 *     actions: {
 *         copy        : (data:service_copy) => void;      // If agentSource and agentWrite are the same device executes file copy as a local stream, otherwise prepares a list of artifacts to send from agentSource to agentWrite
 *         handleError : (errorObject:NodeJS.ErrnoException, message:string, callback:() => void) => boolean; // a generic error handler
 *         list        : (data:service_copy_list) => void; // Receives a list file system artifacts to be received from an remote agent's sendList operation, creates the directory structure, and then requests files by name
 *         sendFile    : receiver;                         // Sends the contents of a requested file across the network.
 *     };
 *     route : (socketData:socketData) => void;            // Directs data to the proper agent by service name.
 *     status: (config:config_copy_status) => void;        // Sends status messages for copy operations.
 * }
 * ``` */
const fileCopy:module_fileCopy = {
    actions: {
        // service: copy - performs a streamed file copy operation without use of a network
        copy: function terminal_server_services_fileCopy_copy(data:service_copy):void {
            if (data.agentSource.user === data.agentWrite.user && data.agentSource.device === data.agentWrite.device) {
                // agentSource/agentWrite - same agent
                let index:number = 0;
                const status:config_copy_status = {
                        agentRequest: data.agentRequest,
                        agentSource: data.agentSource,
                        agentWrite: data.agentWrite,
                        countFile: 0,
                        cut: data.cut,
                        directory: true,
                        failures: 0,
                        location: data.location,
                        message: "",
                        totalSize: 0,
                        writtenSize: 0
                    },
                    length:number = data.location.length,
                    callback = function terminal_server_services_fileCopy_sameAgent_callback(stats:copy_stats):void {
                        status.countFile = status.countFile + stats.files;
                        status.failures = stats.error;
                        index = index + 1;
                        status.writtenSize = (vars.test.type === "service")
                            ? 0
                            : status.writtenSize + stats.size;
                        status.totalSize = (vars.test.type === "service")
                            ? 0
                            : status.totalSize + stats.size;
                        if (index === length) {
                            if (data.cut === true && stats.error === 0) {
                                let removeCount:number = 0;
                                const removeCallback = function terminal_server_services_fileCopy_sameAgent_callback_removeCallback():void {
                                    removeCount = removeCount + 1;
                                    if (removeCount === length) {
                                        fileCopy.status(status);
                                    }
                                };
                                data.location.forEach(function terminal_server_services_fileCopy_sameAgent_callback_removeEach(value:string):void {
                                    remove(value, removeCallback);
                                });
                            }

                            // the delay prevents a race condition that results in a write after end error on the http response
                            setTimeout(function terminal_server_services_fileCopy_sameAgent_callback_delayStatus():void {
                                fileCopy.status(status);
                            }, 100);
                        } else {
                            fileCopy.status(status);
                            copyConfig.target = data.location[index];
                            copy(copyConfig);
                        }
                    },
                    copyConfig:config_command_copy = {
                        callback: callback,
                        destination: data.agentWrite.modalAddress,
                        exclusions: [""],
                        replace: false,
                        target: data.location[index]
                    };
                copy(copyConfig);
            } else {
                // agentSource - send list
                let locationIndex:number = 0,
                    directories:number = 0,
                    fileCount:number = 0,
                    fileSize:number = 0;
                const action:"copy"|"cut" = (data.cut === true)
                        ? "cut"
                        : "copy",
                    lists:directory_list[] = [],
                    listData:copy_stats = {
                        dirs: 0,
                        error: 0,
                        files: 0,
                        link: 0,
                        size: 0
                    },
                    dirCallback = function terminal_server_services_fileCopy_sendList_dirCallback(result:directory_list|string[]):void {
                        const dir:directory_list = result as directory_list,
                            dirComplete = function terminal_server_services_fileCopy_sendList_dirCallback_dirComplete():void {
                                locationIndex = locationIndex + 1;
                                if (locationIndex < data.location.length) {
                                    const recursiveConfig:config_command_directory = {
                                        callback: terminal_server_services_fileCopy_sendList_dirCallback,
                                        depth: 0,
                                        exclusions: [],
                                        mode: "read",
                                        path: data.location[locationIndex],
                                        symbolic: false
                                    };
                                    directory(recursiveConfig);
                                } else {
                                    const listBuild = function terminal_server_services_fileCopy_sendList_dirCallback_dirComplete_listBuild(hashValue:string):void {
                                            const copyList:service_copy_list = {
                                                    agentRequest: data.agentRequest,
                                                    agentSource: data.agentSource,
                                                    agentWrite: data.agentWrite,
                                                    cut: data.cut,
                                                    hash: hashValue,
                                                    ip: (vars.environment.addresses.IPv6.length > 0)
                                                        ? vars.environment.addresses.IPv6[0]
                                                        : vars.environment.addresses.IPv4[0],
                                                    list: lists,
                                                    listData: listData,
                                                    port: vars.environment.ports.ws
                                                },
                                                directoryPlural:string = (directories === 1)
                                                    ? "y"
                                                    : "ies",
                                                plural:string = (fileCount === 1)
                                                    ? ""
                                                    : "s",
                                                status:service_fileSystem_status = {
                                                    agentRequest: data.agentRequest,
                                                    agentSource: data.agentWrite,
                                                    fileList: null,
                                                    message: `Preparing to transfer ${directories} director${directoryPlural} and ${fileCount} file${plural} at size ${common.prettyBytes(fileSize)}.`
                                                };

                                            if (vars.test.type !== "service") {
                                                // send status to agentRequest
                                                fileSystem.route({
                                                    data: status,
                                                    service: "file-system-status"
                                                });

                                                // send status to agentWrite in case they are watching
                                                status.agentRequest = data.agentWrite;
                                                fileSystem.route({
                                                    data: status,
                                                    service: "file-system-status"
                                                });
                                            }

                                            fileCopy.route({
                                                data: copyList,
                                                service: "copy-list"
                                            });
                                        },
                                        // A hash sequence is required only if copying to a remote user because
                                        // * the remote user has to be allowed to bypass share limits of the file system
                                        // * this is because the remote user has to request the files from the local user
                                        // * and the local user's files can be outside of a designated share, which is off limits in all other cases
                                        hashAgentCallback = function terminal_server_services_fileCopy_sendList_dirCallback_dirComplete_hashAgentCallback(hashOutput:hash_output):void {
                                            if (data.agentWrite.user !== data.agentRequest.user) {
                                                data.agentRequest.share = now + hashOutput.hash;
                                            }
                                            listBuild(now + hashOutput.hash);
                                        },
                                        now:number = Date.now();
                                    hash({
                                        algorithm: "sha3-512",
                                        callback: hashAgentCallback,
                                        directInput: true,
                                        source: vars.settings.hashUser + vars.settings.hashDevice + now
                                    });
                            }
                            };
                        if (dir === undefined || dir[0] === undefined) {
                            // something went wrong with the directory command
                            listData.error = listData.error + 1;
                        } else {
                            let index:number = 0;
                            const len:number = dir.length;
                            do {
                                if (dir[index][1] === "directory") {
                                    listData.dirs = listData.dirs + 1;
                                } else if (dir[index][1] === "error") {
                                    listData.error = listData.error + 1;
                                } else if (dir[index][1] === "link") {
                                    listData.link = listData.link + 1;
                                } else {
                                    listData.files = listData.files + 1;
                                    listData.size = listData.size + dir[index][5].size;
                                }
                                index = index + 1;
                            } while (index < len);
                            lists.push(dir);
                        }
                        dirComplete();
                    },
                    dirConfig:config_command_directory = {
                        callback: dirCallback,
                        depth: 0,
                        exclusions: [],
                        mode: "read",
                        path: data.location[locationIndex],
                        symbolic: false
                    };

                // send messaging back to agentRequest
                deviceMask.unmask(data.agentWrite.device, "agentWrite", function terminal_server_services_fileCopy_sendList_listStatus(device:string):void {
                    const messageType:agentType = (data.agentRequest.user === data.agentWrite.user)
                            ? "device"
                            : "user",
                        agent:string = (messageType === "user")
                            ? data.agentWrite.user
                            : device,
                        status:service_fileSystem_status = {
                            agentRequest: data.agentRequest,
                            agentSource: data.agentWrite,
                            fileList: null,
                            message: `Preparing file ${action} to ${messageType} <em>${vars.settings[messageType][agent].name}</em>.`
                        };
                    if (vars.test.type !== "service") {
                        fileSystem.route({
                            data: status,
                            service: "file-system-status"
                        });
                    }
                });
                directory(dirConfig);
            }
        },

        handleError: function terminal_server_services_fileCopy_handleError(errorObject:NodeJS.ErrnoException, message:string, callback:() => void):boolean {
            if (errorObject === null) {
                callback();
                return false;
            }
            error([
                vars.text.angry + message + vars.text.none,
                JSON.stringify(errorObject)
            ]);
            return true;
        },

        // service: copy-list - receives a file copy list at agent.write and makes the required directories
        list: function terminal_server_services_fileCopy_list(data:service_copy_list):void {
            // agentWrite
            let socket:websocket_client = null,
                listIndex:number = 0,
                fileIndex:number = 0,
                fileLen:number = (data.list.length > 0 )
                    ? data.list[listIndex].length
                    : 0;
            const flags:flagList = {
                    dirs: false,
                    tunnel: false
                },
                listLen:number = data.list.length,
                status:config_copy_status = {
                    agentRequest: data.agentRequest,
                    agentSource: data.agentSource,
                    agentWrite: data.agentWrite,
                    countFile: data.listData.files,
                    cut: false,
                    directory: true,
                    failures: data.listData.error,
                    message: "",
                    location: [],
                    totalSize: data.listData.size,
                    writtenSize: 0
                },
                renameCallback = function terminal_server_services_fileCopy_list_renameCallback(renameError:NodeJS.ErrnoException, list:directory_list[]):void {
                    if (renameError === null) {
                        let listIndex:number = 0,
                            directoryIndex:number = 0;
                        const // sort the file list so that directories are first and then are sorted by shortest length
                            directorySort = function terminal_server_services_fileCopy_list_renameCallback_directorySort(a:directory_item, b:directory_item):-1|1 {
                                if (a[1] === "directory" && b[1] !== "directory") {
                                    return -1;
                                }
                                if (a[1] !== "directory" && b[1] === "directory") {
                                    return 1;
                                }
                                if (a[1] === "directory" && b[1] === "directory") {
                                    if (a[6].length < b[6].length) {
                                        return -1;
                                    }
                                }
                                return 1;
                            },

                            // make all the directories before requesting files
                            mkdirCallback = function terminal_server_services_fileCopy_list_renameCallback_mkdirCallback(err:Error):void {
                                const errorString:string = (err === null)
                                    ? ""
                                    : err.toString();
                                if (err === null || errorString.indexOf("file already exists") > 0) {
                                    directoryIndex = directoryIndex + 1;
                                    if (directoryIndex === list[listIndex].length || list[listIndex][directoryIndex][1] !== "directory") {
                                        do {
                                            listIndex = listIndex + 1;
                                        } while(listIndex < list.length && list[listIndex][0][1] !== "directory");
                                        if (listIndex === list.length) {
                                            flags.dirs = true;
                                            if (flags.tunnel === true) {
                                                fileRequest();
                                            }
                                        } else {
                                            directoryIndex = 0;
                                            mkdir(list[listIndex][directoryIndex][6], terminal_server_services_fileCopy_list_renameCallback_mkdirCallback);
                                        }
                                    } else {
                                        mkdir(list[listIndex][directoryIndex][6], terminal_server_services_fileCopy_list_renameCallback_mkdirCallback);
                                    }
                                } else {
                                    error([errorString]);
                                }
                            };

                        // sort each directory list so that directories are first
                        list.forEach(function terminal_server_services_fileCopy_list_renameCallback_sortEach(item:directory_list) {
                            item.sort(directorySort);
                        });

                        if (list[0][0][1] === "directory") {
                            // make directories
                            mkdir(list[0][0][6], mkdirCallback);
                        } else {
                            mkdirCallback(null);
                        }
                    } else {
                        error([
                            "Error executing utility rename.",
                            JSON.stringify(renameError)
                        ]);
                    }
                },
                fileRespond = function terminal_server_services_fileCopy_list_fileRespond(buf:Buffer, complete:boolean, socket:websocket_client):void {
                    const writePath:string = data.list[listIndex][fileIndex][6],
                        hash:Hash = createHash("sha3-512"),
                        writeStream:WriteStream = createWriteStream(writePath);
                    if (vars.settings.brotli > 0) {
                        const decompress:BrotliDecompress = createBrotliDecompress({
                            params: {[constants.BROTLI_PARAM_QUALITY]: vars.settings.brotli}
                        });
                        socket.pipe(decompress).pipe(hash).pipe(writeStream);
                    } else {
                        socket.pipe(hash).pipe(writeStream);
                    }
                    writeStream.on("close", function terminal_fileService_serviceCopy_sendFile_close():void {
                        const hashString:string = hash.digest("hex");
                        console.log("write stream "+hashString);
                    });
                },
                nextFile = function terminal_server_services_fileCopy_list_nextFile():string {
                    if (fileIndex === fileLen) {
                        fileIndex = 0;
                        listIndex = listIndex + 1;
                        fileLen = (listIndex < listLen)
                            ? data.list[listIndex].length
                            : 0;
                    }
                    if (listIndex === listLen) {
                        return null;
                    }
                    if (data.list[listIndex][fileIndex][1] === "file") {
                        return data.list[listIndex][fileIndex][0];
                    }
                    do {
                        fileIndex = fileIndex + 1;
                        if (fileIndex === fileLen) {
                            listIndex = listIndex + 1;
                            if (listIndex === listLen) {
                                return null;
                            }
                            fileIndex = 0;
                            fileLen = data.list[listIndex].length;
                        } else if (data.list[listIndex][fileIndex][1] === "file") {
                            return data.list[listIndex][fileIndex][0];
                        }
                    } while (fileIndex < fileLen);
                    listIndex = listIndex + 1;
                    terminal_server_services_fileCopy_list_nextFile();
                },
                fileRequest = function terminal_server_services_fileCopy_list_fileRequest():void {
                    const nextFileName:string = nextFile();
                    if (nextFileName === null) {
                        fileCopy.status(status);
                        if (data.cut === true && status.failures === 0) {
                            status.cut = true;

                        } else {
                            socket.destroy();
                        }
                    } else {
                        const fileRequest:service_copy_send_file = {
                            brotli: vars.settings.brotli,
                            path_source: nextFileName
                        };
                        fileIndex = fileIndex + 1;
                        socket.removeAllListeners("data");
                        transmit_ws.listener(socket, fileRespond);
                        transmit_ws.queue({
                            data: fileRequest,
                            service: "copy-send-file"
                        }, socket, false);
                    }
                };
            if (data.list.length > 0) {
                rename(data.list, data.agentWrite.modalAddress, renameCallback);
                if (data.listData.files > 0) {
                    transmit_ws.openService({
                        callback: function terminal_server_services_fileCopy_list_socket(socketCopy:string|websocket_client):void {
                            if (typeof socketCopy === "string") {
                                error([`Received an error code attempting to open file copy socket: ${socketCopy}`]);
                            } else {
                                socket = socketCopy;
                                flags.tunnel = true;
                                if (flags.dirs === true) {
                                    fileRequest();
                                }
                            }
                        },
                        hash: data.hash,
                        ip: data.ip,
                        port: data.port,
                        receiver: fileRespond,
                        type: "send-file"
                    });
                } else {
                    fileRequest();
                }
            }
        },

        // service: copy-send-file - sends the contents of a specified file across the network
        sendFile: function terminal_server_services_fileCopy_sendFile(socketData:socketData, transmit:transmit_type):void {
            const data:service_copy_send_file = socketData.data as service_copy_send_file,
                hash:Hash = createHash("sha3-512"),
                readStream:ReadStream = createReadStream(data.path_source);
            if (data.brotli > 0) {
                const compress:BrotliCompress = createBrotliCompress({
                    params: {[constants.BROTLI_PARAM_QUALITY]: data.brotli}
                });
                readStream.pipe(hash).pipe(compress).pipe(transmit.socket);
            } else {
                readStream.pipe(hash).pipe(transmit.socket);
            }
            readStream.on("close", function terminal_fileService_serviceCopy_sendFile_close():void {
                const hashString:string = hash.digest("hex");
            });
        }
    },
    route: function terminal_server_services_fileCopy_route(socketData:socketData):void {
        const data:service_copy_list = socketData.data as service_copy_list;
        if (socketData.service === "copy") {
            const copy = function terminal_server_services_fileCopy_route_copy(socketData:socketData):void {
                const data:service_copy = socketData.data as service_copy;
                if (vars.test.type === "service") {
                    service.evaluation(socketData);
                } else {
                    fileCopy.actions.copy(data);
                }
            };
            sender.route("agentSource", socketData, copy);
        } else if (socketData.service === "copy-list" || socketData.service === "copy-send-file") {
            const dest = function terminal_server_services_fileCopy_route_destList(target:copyAgent, self:copyAgent):copyAgent {
                    if (data.agentWrite.user !== data.agentSource.user && data.agentRequest.user !== data[self].user) {
                        return "agentRequest";
                    }
                    return target;
                },
                copyList = function terminal_server_services_fileCopy_route_copyList(socketData:socketData):void {
                    if (vars.test.type === "service") {
                        service.evaluation(socketData);
                    } else if (socketData.service === "copy-list") {
                        const copyData:service_copy_list = socketData.data as service_copy_list;
                        fileCopy.actions.list(copyData);
                    }
                };
            sender.route(dest("agentWrite", "agentSource"), socketData, copyList);
        }
    },
    status: function terminal_server_services_fileCopy_copyStatus(config:config_copy_status):void {
        const callbackDirectory = function terminal_server_services_fileCopy_copyStatus_callbackDirectory(list:directory_list|string[]):void {
                const dirs:directory_list = list as directory_list,
                    copyStatus:service_fileSystem_status = {
                        agentRequest: config.agentRequest,
                        agentSource: config.agentWrite,
                        fileList: dirs,
                        message: (config.message === "")
                            ? (function terminal_server_services_fileCopy_copyStatus_callbackDirectory_copyMessage():string {
                                const failures:number = (dirs === null || dirs.failures === undefined)
                                        ? config.failures
                                        : dirs.failures.length + config.failures,
                                    percentSize:number = (config.writtenSize / config.totalSize) * 100,
                                    percent:string = (config.writtenSize === 0 || config.totalSize === 0)
                                        ? "0.00%"
                                        : (percentSize > 99.99)
                                            ? "100.00%"
                                            : `${percentSize.toFixed(2)}%`,
                                    filePlural:string = (config.countFile === 1)
                                        ? ""
                                        : "s",
                                    failPlural:string = (failures === 1)
                                        ? ""
                                        : "s",
                                    verb:string = (config.cut === true)
                                        ? "Cutting"
                                        : "Copying";
                                return `${verb} ${percent} complete. ${common.commas(config.countFile)} file${filePlural} written at size ${common.prettyBytes(config.writtenSize)} (${common.commas(config.writtenSize)} bytes) with ${failures} integrity failure${failPlural}.`;
                            }())
                            : config.message
                    },
                    statusMessage:socketData = {
                        data: copyStatus,
                        service: "file-system-status"
                    },
                    broadcast = function terminal_server_services_fileCopy_copyStatus_callbackDirectory_sendStatus_unmask_broadcast():void {
                        sender.broadcast(statusMessage, "browser");
                    };
                if (vars.test.type === "service") {
                    service.evaluation(statusMessage);
                } else {
                    sender.route("agentRequest", statusMessage, broadcast);
                    if (config.cut === true) {
                        copyStatus.agentSource = config.agentSource;
                    }
                    sender.route("agentSource", statusMessage, broadcast);
                }
            },
            dirConfig:config_command_directory = {
                callback: callbackDirectory,
                depth: 2,
                exclusions: [],
                mode: "read",
                path: config.agentWrite.modalAddress,
                symbolic: true
            };
        if (config.directory === true) {
            directory(dirConfig);
        } else {
            callbackDirectory(null);
        }
    }
};

export default fileCopy;