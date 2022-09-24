/* lib/terminal/utilities/ipList - Returns a list of ip addresses for a specified agent. */

import vars from "./vars.js";

const ipList = function terminal_utilities_ipList(agentType:agentType, hash:string, formatting:string):string[] {
    const agent:agent = vars.settings[agentType][hash],
        output:string[] = [],
        list:transmit_addresses_IP = (agent === undefined)
            ? (agentType === "device" && Object.keys(vars.settings.device).length === 0)
                ? vars.network.addresses
                : null
            : agent.ipAll,
        addresses = function terminal_utilities_ipList_addresses(ipType:"IPv4"|"IPv6"):void {
            let a:number = list[ipType].length;
            if (a > 0) {
                do {
                    a = a - 1;
                    output.push(formatting + list[ipType][a]);
                } while (a > 0);
            }
        };
    if (list === null) {
        return output;
    }
    addresses("IPv6");
    addresses("IPv4");
    return output;
};

export default ipList;