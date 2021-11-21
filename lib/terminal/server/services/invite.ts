
/* lib/terminal/server/services/invite - Manages the order of invitation related processes for traffic across the internet. */

import agent_http from "../transmission/agent_http.js";
import agent_ws from "../transmission/agent_ws.js";
import common from "../../../common/common.js";
import heartbeat from "./heartbeat.js";
import ipResolve from "../transmission/ipResolve.js";
import log from "../../utilities/log.js";
import responder from "../transmission/responder.js";
import serverVars from "../serverVars.js";
import settings from "./settings.js";

const invite = function terminal_server_services_invite(socketData:socketData, transmit:transmit):void {
    const data:service_invite = socketData.data as service_invite,
        localAddress:string = ((/(\d{1,3}\.){3}\d{1,3}/).test(data.agentRequest.ipSelected) === false && serverVars.localAddresses.IPv6.length > 0)
            ? serverVars.localAddresses.IPv6[0]
            : serverVars.localAddresses.IPv4[0],
        userAddresses:networkAddresses = ipResolve.userAddresses(),
        inviteHttp = function terminal_server_services_invite_inviteHttp():void {
            const httpConfig:httpRequest = {
                agent: "",
                agentType: data.type,
                callback: function terminal_server_services_invite_request_callback(message:socketData):void {
                    if (serverVars.testType === "") {
                        const inviteData:service_invite = message.data as service_invite;
                        log([inviteData.message]);
                    }
                },
                ip: (data.action === "invite-request")
                    ? data.agentResponse.ipSelected
                    : data.agentRequest.ipSelected,
                payload: {
                    data: data,
                    service: "invite"
                },
                port: (data.action === "invite-request")
                    ? data.agentResponse.ports.http
                    : data.agentRequest.ports.http
            };
            agent_http.request(httpConfig);
        },
        /**
         * Methods for processing the various stages of the invitation process.
         * * **invite-complete** - Step 4: Receipt of the response at the originating device terminal for transmission to the browser.
         * * **invite-request** - Step 2: Receipt of the invitation request at the remote machine's terminal for processing to its browser.
         * * **invite-response** - Step 3: Receipt of the remote user's response at the remote machine's terminal for transmission to the originating machine.
         * * **invite-start** - Step 1: Receipt of an invite request from the local browser.
         *
         * ```typescript
         * interface module_inviteActions {
         *     "invite-complete": () => void;
         *     "invite-request": () => void;
         *     "invite-response": () => void;
         *     "invite-start": () => void;
         * }
         * ``` */
        actions:module_inviteActions = {
            "invite-complete": function terminal_server_services_invite_inviteComplete():void {
                // stage 4 - on start terminal to start browser
                const name:string = (data.type === "device")
                        ? data.agentResponse.nameDevice
                        : data.agentResponse.nameUser,
                    respond:string = ` invitation returned from ${data.type} '${name}'.`;
                data.message = common.capitalize(data.status) + respond;
                if (data.status === "accepted") {
                    const devices:string[] = Object.keys(serverVars.device),
                        keyShares:string[] = (data.agentResponse.shares === null)
                            ? []
                            : Object.keys(data.agentResponse.shares),
                        total:number = keyShares.length,
                        payload:agents = (data.type === "device")
                            ? serverVars.device
                            : {},
                        callback = function terminal_server_services_invite_inviteComplete_callback():void {
                            count = count + 1;
                            if (count === total) {
                                // share amongst other devices if there are other devices to share to
                                if (devices.length > 1) {
                                    const update:service_agentUpdate = {
                                        action: "update",
                                        agentFrom: "invite-complete",
                                        broadcastList: {
                                            distribution: devices,
                                            payload: payload,
                                            type: data.type
                                        },
                                        shares: serverVars[data.type],
                                        status: "active",
                                        type: data.type
                                    };
                                    heartbeat({
                                        data: update,
                                        service: "heartbeat"
                                    }, null);
                                }
                            }
                        };
                    let count:number = 0;

                    // build the payload for sharing amongst other devices
                    if (data.type === "device") {
                        keyShares.forEach(function terminal_server_service_invite_inviteComplete_devicesEach(deviceName:string):void {
                            payload[deviceName] = data.agentResponse.shares[deviceName];
                            agent_ws.open({
                                agent: deviceName,
                                agentType: "device",
                                callback: callback
                            });
                        });
                    } else if (data.type === "user") {
                        serverVars.user[keyShares[0]] = data.agentResponse.shares[keyShares[0]];
                        payload[keyShares[0]] = serverVars.user[keyShares[0]];
                        agent_ws.open({
                            agent: keyShares[0],
                            agentType: data.type,
                            callback: callback
                        });
                    }
                }
                agent_ws.broadcast({
                    data: data,
                    service: "invite"
                }, "browser");
            },
            "invite-request": function terminal_server_services_invite_inviteRequest():void {
                // stage 2 - on remote terminal to remote browser
                const agent:agent = (data.type === "user")
                    ? serverVars.user[data.agentRequest.hashUser]
                    : serverVars.device[data.agentRequest.hashDevice];
                data.agentResponse = {
                    hashDevice: (data.type === "device")
                        ? serverVars.hashDevice
                        : "",
                    hashUser: serverVars.hashUser,
                    ipAll: serverVars.localAddresses,
                    ipSelected: localAddress,
                    modal: "",
                    nameDevice: (data.type === "device")
                        ? serverVars.nameDevice
                        : "",
                    nameUser: serverVars.nameUser,
                    ports: serverVars.ports,
                    shares: (data.type === "device")
                        ? serverVars.device
                        : {
                            [serverVars.hashUser]: {
                                deviceData: null,
                                ipAll: serverVars.localAddresses,
                                ipSelected: localAddress,
                                name: serverVars.nameUser,
                                ports: serverVars.ports,
                                shares: common.selfShares(serverVars.device, null),
                                status: "active"
                            }
                        }
                };
                serverVars.device[serverVars.hashDevice].ipSelected = localAddress;
                if (agent === undefined) {
                    agent_ws.broadcast({
                        data: data,
                        service: "invite"
                    }, "browser");
                } else {
                    // if the agent is already registered with the remote then bypass the user by auto-approving the request
                    data.message = `Accepted invitation. Request processed at responding terminal ${data.agentResponse.ipSelected} for type ${data.type}.  Agent already present, so auto accepted and returned to requesting terminal.`;
                    data.action = "invite-complete";
                    data.status = "accepted";
                    inviteHttp();
                }
            },
            "invite-response": function terminal_server_services_invite_inviteResponse():void {
                const respond:string = ` invitation response processed at responding terminal ${localAddress} and sent to requesting terminal ${data.agentRequest.ipSelected}.`;
                // stage 3 - on remote terminal to start terminal, from remote browser
                data.message = common.capitalize(data.status) + respond;
                data.action = "invite-complete";
                inviteHttp();
            },
            "invite-start": function terminal_server_services_invite_invite():void {
                // stage 1 - on start terminal to remote terminal, from start browser
                serverVars.device[serverVars.hashDevice].ipSelected = localAddress;
                data.action = "invite-request";
                data.agentRequest.shares = (data.type === "device")
                    ? serverVars.device
                    : {
                        [serverVars.hashUser]: {
                            deviceData: null,
                            ipAll: userAddresses,
                            ipSelected: localAddress,
                            name: serverVars.nameUser,
                            ports: serverVars.ports,
                            shares: common.selfShares(serverVars.device, null),
                            status: "offline"
                        }
                    };
                inviteHttp();
            }
        };
    actions[data.action]();
    //log([responseString]);
    if (transmit.type === "http") {
        if (serverVars.testType === "service" || (data.action !== "invite-complete" && data.action !== "invite-start") || (data.action === "invite-complete" && data.status === "accepted")) {
            responder({
                data: data,
                service: "invite"
            }, transmit);
        } else {
            agent_http.respondEmpty(transmit);
        }
    }
};

export default invite;