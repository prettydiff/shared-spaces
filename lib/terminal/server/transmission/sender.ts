/* lib/terminal/server/transmission/sender - Abstracts away the communication channel from the message. */

import deviceMask from "../services/deviceMask.js";
import transmit_http from "./transmit_http.js";
import transmit_ws from "./transmit_ws.js";
import vars from "../../utilities/vars.js";

/**
 * An abstraction to manage traffic output abstracted away from specific network protocols.
 * ```typescript
 * interface module_sender {
 *     broadcast: (payload:socketData, listType:websocketClientType) => void; // Send a specified ata package to all agents of a given agent type.
 *     route    : (destination:copyAgent, socketData:socketData, callback:(socketData:socketData) => void) => void; // Automation to redirect data packages to a specific agent examination of a service identifier and agent data.
 *     send     : (data:socketData, agents:transmit_agents) => void;          // Send a specified data package to a specified agent
 * }
 * ``` */
const sender:module_sender = {
    // send to all agents of a given type
    broadcast: function terminal_server_transmission_sender_broadcast(payload:socketData, listType:websocketClientType):void {
        if (listType === "browser") {
            const list:string[] = Object.keys(transmit_ws.clientList[listType]);
            list.forEach(function terminal_server_transmission_transmitWs_broadcast_each(agent:string):void {
                transmit_ws.queue(payload, transmit_ws.clientList[listType][agent], true);
            });
        } else {
            const list:string[] = Object.keys(vars.settings[listType]);
            let index:number = list.length,
                socket:websocket_client = null;
            
            if ((listType === "device" && index > 1) || (listType !== "device" && index > 0)) {
                do {
                    index = index - 1;
                    if (listType !== "device" || (listType === "device" && list[index] !== vars.settings.hashDevice)) {
                        socket = transmit_ws.clientList[listType][list[index]];
                        if (socket !== undefined && socket !== null && socket.status === "open") {
                            transmit_ws.queue(payload, socket, false);
                        } else {
                            transmit_http.request({
                                agent: list[index],
                                agentType: listType,
                                callback: null,
                                ip: vars.settings[listType][list[index]].ipSelected,
                                payload: payload,
                                port: vars.settings[listType][list[index]].ports.http
                            });
                        }
                    }
                } while (index > 0);
            }
        }
    },

    // direct a data payload to a specific agent as determined by the service name and the agent details in the data payload
    route: function terminal_server_transmission_sender_route(destination:copyAgent, socketData:socketData, callback:(socketData:socketData) => void):void {
        const payload:service_copy = socketData.data as service_copy,
            agentDevice:string = payload[destination].device,
            agentUser:string = payload[destination].user,
            agentWrite:fileAgent = (payload.agentWrite === undefined)
                ? null
                : payload.agentWrite;
        if (agentDevice === vars.settings.hashDevice) {
            // same device
            callback(socketData);
        } else {
            // determine if device masking is warranted
            if (payload.agentRequest.user === payload.agentSource.user && (agentWrite === null || payload.agentRequest.user === agentWrite.user)) {
                // no external user, no masking required
                sender.send(socketData, {
                    device: agentDevice,
                    user: agentUser
                });
            } else {
                // external user concerns here
            }
        }
    },

    // send a specified data package to a specified agent
    send: function terminal_server_transmission_sender_send(data:socketData, agents:transmit_agents):void {
        if (agents.user === "browser") {
            transmit_ws.queue(data, transmit_ws.clientList.browser[agents.device], true);
        } else {
            const protocols = function terminal_server_transmission_sender_send_protocols(agent:string, agentType:agentType):void {
                const socket:websocket_client = transmit_ws.clientList[agentType][agent];
                if (socket !== undefined && socket !== null && socket.status === "open") {
                    transmit_ws.queue(data, socket, false);
                } else {
                    transmit_http.request({
                        agent: agent,
                        agentType: agentType,
                        callback: null,
                        ip: vars.settings[agentType][agent].ipSelected,
                        payload: data,
                        port: vars.settings[agentType][agent].ports.http
                    });
                }
            };
            if (agents.user === vars.settings.hashUser) {
                if (agents.device.length === 141) {
                    deviceMask.unmask(agents.device, null, function terminal_server_transmission_sender_send_unmask(actualDevice:string):void {
                        protocols(actualDevice, "device");
                    });
                } else {
                    protocols(agents.device, "device");
                }
            } else {
                protocols(agents.user, "user");
            }
        }
    }
};

export default sender;