/* lib/typescript/environment.d - TypeScript interfaces that define environmental objects. */

// browser environment
interface browser {
    content: HTMLElement;
    data: ui_data;
    device: agents;
    loadFlag: boolean;
    localNetwork: localNetwork;
    menu: {
        export: HTMLElement;
        fileNavigator: HTMLElement;
        systemLog: HTMLElement;
        settings: HTMLElement;
        textPad: HTMLElement;
        "agent-delete": HTMLElement;
        "agent-invite": HTMLElement;
    };
    pageBody: Element;
    socket?: WebSocket;
    style: HTMLStyleElement;
    testBrowser: testBrowserRoute;
    user: agents;
}
interface localNetwork {
    addresses: networkAddresses;
    httpPort: number;
    wsPort: number;
}
interface ui_data {
    audio: boolean;
    brotli: brotli;
    color: colorScheme;
    colors: colors;
    hashDevice: string;
    hashType: hash;
    hashUser: string;
    modals: {
        [key:string]: modal;
    };
    modalTypes: string[];
    nameDevice: string;
    nameUser: string;
    zIndex: number;
}
// ------------------------------------

// terminal, service specific
interface FSWatcher extends Function {
    close: Function;
    time: number;
}
interface networkAddresses {
    IPv4: string[];
    IPv6: string[];
}
interface serverVars {
    brotli: brotli;
    device: agents;
    hashDevice: string;
    hashType: hash;
    hashUser: string;
    localAddresses: networkAddresses;
    message: messageItem[];
    nameDevice: string;
    nameUser: string;
    requests: number;
    secure: boolean;
    status: heartbeatStatus;
    storage: string;
    testBrowser: testBrowserRoute;
    testType: testListType;
    timeStore: number;
    user: agents;
    watches: {
        [key:string]: FSWatcher;
    };
    webPort: number;
    wsPort: number;
}
// ------------------------------------

// terminal, universal
interface terminalVariables {
    binary_check: RegExp;
    broadcast: (type:requestType, data:string) => void;
    cli: string;
    command: string;
    commands: commandList;
    cwd: string;
    exclusions: string[];
    flags: {
        error: boolean;
        write: string;
    },
    js: string;
    node: {
        child : any;
        crypto: any;
        fs    : any;
        http  : any;
        https : any;
        http2 : any;
        net   : any;
        os    : any;
        path  : any;
        stream: any;
        zlib  : any;
    };
    projectPath: string;
    sep: string;
    startTime: bigint;
    text: {
        [key:string]: string;
    };
    verbose: boolean;
    version: version;
    ws: any;
}
interface version {
    command: string;
    date: string;
    hash: string;
    name: string;
    number: string;
    port: number;
}
// ------------------------------------