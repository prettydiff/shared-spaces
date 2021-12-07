
/* lib/browser/content/global_events - Events not associated with specific content or a modal type. */

import browser from "../browser.js";
import common from "../../common/common.js";
import file_browser from "./file_browser.js";
import modal from "../modal.js";
import network from "../utilities/network.js";
import share from "./share.js";
import util from "../utilities/util.js";

const global_events:module_globalEvents = {
    contextMenuRemove: function browser_context_menuRemove():void {
        const menu:Element = document.getElementById("contextMenu");
        if (menu !== null) {
            menu.parentNode.removeChild(menu);
        }
    },
    fullscreen: function browser_init_complete_fullscreen():void {
        if (document.fullscreenEnabled === true) {
            if (document.fullscreenElement === null) {
                browser.pageBody.requestFullscreen();
            } else {
                document.exitFullscreen();
            }
        }
    },
    fullscreenChange: function browser_init_complete_fullscreenChange():void {
        const button:HTMLElement = document.getElementById("fullscreen"),
            span:Element = button.getElementsByTagName("span")[0];
        let text:string = (document.fullscreenElement === null)
            ? "Toggle Fullscreen"
            : "Exit Fullscreen";
        span.innerHTML = text;
        button.title = text;
        button.firstChild.textContent = (document.fullscreenElement === null)
            ? "\u26f6"
            : "\u26cb";
    },

    /* Show/hide for the primary application menu that hangs off the title bar. */
    menu: function browser_utilities_util_menu():void {
        const menu:HTMLElement = document.getElementById("menu"),
            move = function browser_utilities_util_menu_move(event:MouseEvent):void {
                if (event.clientX > menu.clientWidth || event.clientY > menu.clientHeight + 51) {
                    menu.style.display = "none";
                    document.onmousemove = null;
                }
            };
        if (menu.style.display !== "block") {
            menu.style.display = "block";
        } else {
            menu.style.display = "none";
        }
        document.onmousemove = move;
    },

    /* Hides the primary menu on blur. */
    menuBlur: function browser_utilities_util_menuBlur():void {
        const active:Element = document.activeElement,
            menu:HTMLElement = document.getElementById("menu");
        if (active.parentNode.parentNode !== menu) {
            menu.style.display = "none";
        }
    },

    /* Minimize all modals to the bottom tray that are of modal status: normal and maximized */
    minimizeAll: function browser_utilities_util_minimizeAll():void {
        const keys:string[] = Object.keys(browser.data.modals),
            length:number = keys.length;
        let a:number = 0,
            status:modalStatus;
        global_events.minimizeAllFlag = true;
        do {
            status = browser.data.modals[keys[a]].status;
            if (status === "normal" || status === "maximized") {
                modal.forceMinimize(keys[a]);
            }
            a = a + 1;
        } while (a < length);
        global_events.minimizeAllFlag = false;
        network.configuration();
    },

    /* A flag to keep settings informed about application state in response to minimizing all modals. */
    minimizeAllFlag: false,

    modal: {
        configuration: function browser_content_configuration_modal(event:MouseEvent):void {
            const configuration:HTMLElement = document.getElementById("configuration-modal"),
                data:modal = browser.data.modals["configuration-modal"];
            modal.zTop(event, configuration);
            if (data.status === "hidden") {
                configuration.style.display = "block";
            }
            data.status = "normal";
            document.getElementById("menu").style.display = "none";
        },

        /* Create a file navigate modal */
        fileNavigate: function browser_fileBrowser_navigate(event:Event, config?:navConfig):void {
            const agentName:string = (config === undefined || config.agentName === undefined)
                    ? browser.data.hashDevice
                    : config.agentName,
                agentType:agentType = (agentName === browser.data.hashDevice)
                    ? "device"
                    : config.agentType,
                location:string = (config !== undefined && typeof config.path === "string")
                    ? config.path
                    : "**root**",
                share:string = (config === undefined || config.share === undefined)
                    ? ""
                    : config.share,
                readOnly:boolean = (agentName !== browser.data.hashDevice && config !== undefined && config.readOnly === true),
                readOnlyString:string = (readOnly === true && agentType === "user")
                    ? "(Read Only) "
                    : "",
                callback = function browser_fileBrowser_navigate_callback(responseText:string):void {
                    if (responseText === "") {
                        return;
                    }
                    const status:service_fileStatus = JSON.parse(responseText).data,
                        replaceAddress:boolean = (location === "**root**");
                    if (box === null) {
                        return;
                    }
                    util.fileStatus({
                        data: status,
                        service: "file-status-device"
                    });
                    if (replaceAddress === true) {
                        let loc:string = (replaceAddress === true && typeof status.fileList !== "string")
                            ? status.fileList[0][0]
                            : location;
                        const modal:modal = browser.data.modals[id];
                        box.getElementsByTagName("input")[0].value = (typeof status.fileList === "string")
                            ? "/"
                            : status.fileList[0][0];
                        modal.text_value = loc;
                        modal.history[modal.history.length - 1] = loc;
                        network.configuration();
                    }
                },
                payloadNetwork:service_fileSystem = {
                    action: "fs-directory",
                    agent: {
                        id: agentName,
                        modalAddress: location,
                        share: share,
                        type: agentType
                    },
                    depth: 2,
                    location: [location],
                    name: "navigate"
                },
                payloadModal:modal = {
                    agent: agentName,
                    agentType: agentType,
                    content: util.delay(),
                    inputs: ["close", "maximize", "minimize", "text"],
                    read_only: readOnly,
                    selection: {},
                    share: share,
                    status_bar: true,
                    text_event: file_browser.events.text,
                    text_placeholder: "Optionally type a file system address here.",
                    text_value: location,
                    title: `${document.getElementById("fileNavigator").innerHTML} ${readOnlyString}- ${common.capitalize(agentType)}, ${browser[agentType][agentName].name}`,
                    type: "fileNavigate",
                    width: 800
                },
                box:Element = modal.create(payloadModal),
                id:string = box.getAttribute("id");
            network.send(payloadNetwork, "file-system", callback);
            document.getElementById("menu").style.display = "none";
        }
    },

    /* Associates share content to share modals representing multiple agents. */
    shareAll: function browser_init_complete_shareAll(event:MouseEvent):void {
        const element:Element = event.target as Element,
            parent:Element = element.parentNode as Element,
            classy:string = element.getAttribute("class");
        if (parent.getAttribute("class") === "all-shares") {
            share.tools.modal("", "", null);
        } else if (classy === "device-all-shares") {
            share.tools.modal("", "device", null);
        } else if (classy === "user-all-shares") {
            share.tools.modal("", "user", null);
        }
    }
};

export default global_events;