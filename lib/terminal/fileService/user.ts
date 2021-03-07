
/* lib/terminal/fileService/user - Manages user security permissions. */

import response from "../server/response.js";
import serverVars from "../server/serverVars.js";

const user = function terminal_fileService_user(config:fileUser):void {
    const respond = function terminal_fileService_user_respond(message:string, type:"missing"|"noShare"|"readOnly"):void {
            const status:fileStatusMessage = {
                address: config.agent.modalAddress,
                agent: serverVars.hashUser,
                agentType: "user",
                fileList: type,
                message: message
            };
            response({
                message: JSON.stringify(status),
                mimeType: "application/json",
                responseType: (config.action.indexOf("fs") === 0)
                    ? "fs"
                    : "copy",
                serverResponse: config.serverResponse
            });
        },
        // find the device associated with a give share hash
        findDevice = function terminal_fileService_user_findDevice():string {
            if (config.agent === null) {
                return "";
            }
            const devices:string[] = Object.keys(serverVars.device);
            let deviceLength:number = devices.length;
            do {
                deviceLength = deviceLength - 1;
                if (Object.keys(serverVars.device[devices[deviceLength]].shares).indexOf(config.agent.share) > -1) {
                    return devices[deviceLength];
                }
            } while (deviceLength > 0);
            return "";
        },
        // if a device is identified determine if it allows writing against changing actions
        readOnly = function terminal_fileService_user_readOnly(device:string):string {
            if (device === "") {
                return "";
            }
            const shares = Object.keys(serverVars.device[device].shares),
                shareSort = function terminal_fileService_user_shareSort(a:string, b:string):-1|1 {
                    if (serverVars.device[targetDevice].shares[a].name.length < serverVars.device[targetDevice].shares[b].name.length) {
                        return 1;
                    }
                    return -1;
                };
            let shareLength = shares.length,
                shareItem:agentShare;
            shares.sort(shareSort);
            do {
                shareLength = shareLength - 1;
                shareItem = serverVars.device[device].shares[shares[shareLength]];
                if (shareItem.readOnly === true) {
                    if (config.agent.modalAddress.indexOf(shareItem.name) === 0) {
                        if (config.action === "copy" || config.action === "cut" || config.action === "fs-destroy" || config.action === "fs-new" || config.action === "fs-rename" || config.action === "fs-write") {
                            return "readOnly";
                        }
                        return device;
                    }
                }
            } while (shareLength > 0);
            return "";
        },
        targetDevice:string = findDevice(),
        targetStatus:string = readOnly(targetDevice);

    if (config.action === "cut" && targetStatus === "readOnly") {
        respond(`Action cut is not allowed as location ${config.agent.modalAddress} is in a read only share.`, "readOnly");
        return;
    }
    if (targetStatus === "readOnly") {
        respond(`Action ${config.action.replace("fs-", "")} is not allowed as location ${config.agent.modalAddress} is in read only share.`, "readOnly");
        return;
    }
    if (targetStatus === "") {
        respond(`User ${serverVars.nameUser} does not own the share for this location.`, "noShare");
        return;
    }
    config.callback(targetStatus);
};

export default user;