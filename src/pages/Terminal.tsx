import {
  DialogButton,
  GamepadEvent,
  SteamSpinner,
  useParams,
  TextField,
  Focusable,
  GamepadButton,
  Field,
  staticClasses,
} from "decky-frontend-lib";
import { VFC, useRef, useState, useEffect } from "react";
import { Terminal as XTermTerminal } from 'xterm';
import { AttachAddon } from 'xterm-addon-attach';
import { FitAddon } from 'xterm-addon-fit';
import TerminalGlobal from "../common/global";
import XTermCSS from "../common/xterm_css";
import { FaArrowDown, FaArrowLeft, FaArrowRight, FaArrowUp, FaChevronCircleLeft, FaExpand, FaKeyboard, FaTerminal } from "react-icons/fa";
import { IconDialogButton } from "../common/components";

const Terminal: VFC = () => {

  // I can't find RouteComponentParams :skull:
  const { id } = useParams() as any;
  const [loaded, setLoaded] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [title, setTitle] = useState<string | null>(null);
  const [config, setConfig] = useState<Record<string, any> | null>(null);
  const [openFunctionRow, setOpenFunctionRow] = useState<boolean>(false);
  let prevId: string|undefined = undefined;

  // Create a ref to hold the xterm instance
  const xtermRef = useRef<XTermTerminal | null>(null);
  const xtermDiv = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const fakeInputRef = useRef<typeof TextField | null>(null);

  const wrappedConnectIO = async () => {
    try {
      await connectIO()
    } catch(e) {
      console.error(e)
    }
  }

  const getConfig = async (): Promise<Record<string, any>|undefined> => {
    const serverAPI = TerminalGlobal.getServer()
    const config = await serverAPI.callPluginMethod<{}, string[]>("get_config", {});

    if (config.success) {
        setConfig(config.result)

        return config.result;
    }

    return;
  }

  const updateTitle = async (title: string): Promise<Record<string, any>|undefined> => {
    const serverAPI = TerminalGlobal.getServer()
    await serverAPI.callPluginMethod<{ terminal_id: string, title: string }, string[]>("set_terminal_title", { terminal_id: id, title });

    return;
  }

  const connectIO = async () => {
    prevId = id;
    setTitle(id);

    const xterm = xtermRef.current

    const serverAPI = TerminalGlobal.getServer()
    const localConfig = await getConfig()

    if (localConfig && xterm) {
      if (localConfig.__version__ === 1) {
        if (localConfig.font_family?.trim()) {
          xterm.options.fontFamily = localConfig.font_family;
        }

        if (localConfig.font_size) {
          const fs = parseInt(localConfig.font_size);
          if (!isNaN(fs) && fs > 0) {
            xterm.options.fontSize = fs;
          }
        }
      }
    }

    const terminalResult = await serverAPI.callPluginMethod<{
      terminal_id: string
    }, number>("get_terminal", { terminal_id: id });
    if (terminalResult.success) {
      if (terminalResult.result === null) {
        xterm?.write("--- Terminal Not Found ---");
        history.back();
      }
      if ((terminalResult.result as any)?.title) {
        const title = (terminalResult.result as any)?.title;
        setTitle(title)
      }
    }

    const result = await serverAPI.callPluginMethod<{}, number>("get_server_port", {});
    if (result.success) {
      const url = new URL('ws://127.0.0.1:'+result.result+'/v1/terminals/'+id);
      const ws = new WebSocket(url);

      if (wsRef.current !== null) {
        try {
          wsRef.current.close()
        } catch(e) {}
      }

      wsRef.current = ws;
      ws.onclose = () => {
        xterm?.write("\r\n--- Terminal Disconnected ---")
      }

      if (xterm) {
        xterm.onTitleChange((title) => {
          setTitle(title)
          updateTitle(title)
        })
      }
      
      const attachAddon = new AttachAddon(ws);
      xterm?.loadAddon(attachAddon);

      // Set the loaded state to true after xterm is initialized
      setLoaded(true);

      await xterm?.open(xtermDiv.current as HTMLDivElement);
      // wait for it!
      await (new Promise<void>((res) => setTimeout(res, 1)));
      fitToScreen()

      if (xterm) {
        xterm.onResize((e) => {
          setWindowSize(e.rows, e.cols);
        });

        await setWindowSize(xterm.rows, xterm.cols);
      }
      
      if (fakeInputRef.current) {
        const inputBox = (fakeInputRef.current as any).m_elInput as HTMLInputElement;
        if (inputBox.tabIndex !== -1) {
          inputBox.tabIndex = -1;
          inputBox.addEventListener("click", (e) => {
            setFocusToTerminal();
          })
        }
      }
    }
  };

  const setWindowSize = async (rows: number, cols: number) => {
    const serverAPI = TerminalGlobal.getServer()
    const result = await serverAPI.callPluginMethod<{
      terminal_id: string,
      rows: number,
      cols: number,
    }, number>("change_terminal_window_size", {
      terminal_id: id,
      rows,
      cols,
    });
  }

  const openKeyboard = () => {
    if (config?.disable_virtual_keyboard) {
      setFocusToTerminal();
      return;
    }

    const fakeInput = fakeInputRef.current as any
    if (fakeInput?.m_elInput) {
      fakeInput.m_elInput.click()
    } else {
      fakeInput.click()
    }
  }

  const setFocusToTerminal = () => {
    setTimeout(() => {
      xtermRef.current?.focus()
    }, 100)
  }

  useEffect(() => {
    // Initialize xterm instance and attach it to a DOM element
    const xterm = new XTermTerminal({
      //scrollback: 0,
    });
    xtermRef.current = xterm;
    wrappedConnectIO()

    // Clean up function
    return () => {
      // Dispose xterm instance when component is unmounted
      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
      }

      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null;
      }

      setFullScreen(false)
    };
  }, [ id ]);

  const fitToScreen = (_fullScreen?: boolean) => {
    const isFullScreen = _fullScreen === undefined ? fullScreen : _fullScreen
    
    if (xtermRef.current) {
      const xterm = xtermRef.current

      const fitAddon = new FitAddon()
      xtermRef.current.loadAddon(fitAddon)
      const res = fitAddon.proposeDimensions();
      if (res?.rows && res.cols) {
        const colOffset = (Math.ceil(30 / xterm.options.fontSize));

        if (isFullScreen) xterm.resize(res.cols - colOffset, res.rows - 1)
        else xterm.resize(res.cols + colOffset, res.rows)
      }
    }
  }

  const startFullScreen = () => {
    setFullScreen(true);
    //handleResize()
    setTimeout(() => {
      try {
        fitToScreen(true)
      } catch(e) {
        console.error(e)
      }
    }, 0);
  }

  const gamepadHandler = (evt: GamepadEvent) => {
    if (config?.use_dpad) {
      evt.preventDefault();

      let command: string | undefined = undefined;
      switch (evt.detail.button) {
        case GamepadButton.DIR_UP:
          command = '\x1b[A';
          break;
        case GamepadButton.DIR_DOWN:
          command = '\x1b[B';
          break;
        case GamepadButton.DIR_RIGHT:
          command = '\x1b[C';
          break;
        case GamepadButton.DIR_LEFT:
          command = '\x1b[D';
          break;
      }

      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED && command) {
        wsRef.current.send(command)

        // refocus xterm
        if (config?.use_dpad && !fullScreen) {
          setTimeout(() => {
            if (xtermRef.current) {
              xtermRef.current.focus()
            }
          }, 100)
        }
      }
    }
  }

  const getPadding = () => {
    let amount = 5;
    if (!fullScreen) {
      amount += 6;
    }

    if (config?.handheld_mode) {
      const row = 47;
      const allRows = row * 5;
      const padding = 3;

      const final = allRows + padding;

      // remove bottom bar padding
      amount -= 2.5;

      return 'calc('+amount+'em + '+final+'px)';
    }

    if (!fullScreen) {
      if (config?.extra_keys) {
        amount += 3;
      }
    }

    return amount+'em';
  };

  const ModifiedTextField = TextField as any;
  if (!loaded) return <SteamSpinner />

  return (
    <Focusable noFocusRing={true} onGamepadDirection={gamepadHandler} style={{ margin: 0, padding: 0, paddingTop: "2.5rem", color: "white", width: '100vw' }}>
      <div style={{padding: fullScreen ? "0" : "0 1rem", }}>
        <XTermCSS />
        {
          (!fullScreen) ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem'}}>
            <h1 style={{ margin: '1rem 0', whiteSpace: 'nowrap', overflowX: 'hidden', textOverflow: 'ellipsis' }}>{title}</h1>
            <Focusable style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '1rem' }}>
              {
                !config?.disable_virtual_keyboard ? 
                  <DialogButton style={{ minWidth: '1rem' }} onClick={openKeyboard}><FaKeyboard /></DialogButton> :
                  <DialogButton style={{ minWidth: '1rem' }} onClick={setFocusToTerminal}><FaTerminal /></DialogButton>
              }
              <DialogButton style={{ minWidth: '1rem' }} onClick={startFullScreen}><FaExpand /></DialogButton>
            </Focusable>
          </div> : <div></div>
        }
        
        {
          config?.disable_virtual_keyboard && fullScreen ?
          <DialogButton style={{ visibility: 'hidden', zIndex: -10, position: 'absolute' }} onClick={setFocusToTerminal}></DialogButton> :
            <ModifiedTextField ref={fakeInputRef} disabled={config?.disable_virtual_keyboard ?? false} style={{ display: 'none' }} onClick={setFocusToTerminal} />
        }
        <Focusable onClick={openKeyboard} style={{boxSizing: 'content-box'}}>
          <div ref={xtermDiv} style={{ width: '100%', maxWidth: '100vw', margin: 0, background: '#000', padding: 0, height: "calc(100vh - "+getPadding()+")" }}></div>
        </Focusable>

        {
          (config?.extra_keys && (!fullScreen || config?.handheld_mode)) && 
            <Focusable style={{ overflowX: 'scroll', display: 'flex', gap: '1rem', padding: '.5rem', width: 'fit-content', maxWidth: 'calc(100% - 2rem)', margin: '0 auto' }}>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '.5rem' }}>
                <IconDialogButton onClick={() => wsRef.current?.send('\x1b')}>Esc</IconDialogButton>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '.5rem'}}>
                {
                  openFunctionRow &&
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '.25rem'}}>
                      <IconDialogButton onClick={() => wsRef.current?.send('\x1b[1P')}>F1</IconDialogButton>
                      <IconDialogButton onClick={() => wsRef.current?.send('\x1b[1Q')}>F2</IconDialogButton>
                      <IconDialogButton onClick={() => wsRef.current?.send('\x1b[1R')}>F3</IconDialogButton>
                      <IconDialogButton onClick={() => wsRef.current?.send('\x1b[1S')}>F4</IconDialogButton>
                      <IconDialogButton onClick={() => wsRef.current?.send('\x1b[15~')}>F5</IconDialogButton>
                      <IconDialogButton onClick={() => wsRef.current?.send('\x1b[17~')}>F6</IconDialogButton>
                      <IconDialogButton onClick={() => wsRef.current?.send('\x1b[18~')}>F7</IconDialogButton>
                      <IconDialogButton onClick={() => wsRef.current?.send('\x1b[19~')}>F8</IconDialogButton>
                      <IconDialogButton onClick={() => wsRef.current?.send('\x1b[20~')}>F9</IconDialogButton>
                      <IconDialogButton onClick={() => wsRef.current?.send('\x1b[21~')}>F10</IconDialogButton>
                      <IconDialogButton onClick={() => wsRef.current?.send('\x1b[23~')}>F11</IconDialogButton>
                      <IconDialogButton onClick={() => wsRef.current?.send('\x1b[24~')}>F12</IconDialogButton>
                    </div>
                }

                {
                  openFunctionRow ? 
                  <IconDialogButton onClick={() => setOpenFunctionRow(false)}><FaChevronCircleLeft /></IconDialogButton> :
                  <IconDialogButton onClick={() => setOpenFunctionRow(true)}>Fn</IconDialogButton>

                }
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '.5rem'}}>
                <IconDialogButton onClick={() => wsRef.current?.send('\x1b[D')}><FaArrowLeft /></IconDialogButton>
                <IconDialogButton onClick={() => wsRef.current?.send('\x1b[A')}><FaArrowUp /></IconDialogButton>
                <IconDialogButton onClick={() => wsRef.current?.send('\x1b[B')}><FaArrowDown /></IconDialogButton>
                <IconDialogButton onClick={() => wsRef.current?.send('\x1b[C')}><FaArrowRight /></IconDialogButton>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '.5rem'}}>
                <IconDialogButton onClick={() => wsRef.current?.send('\x03')}>^C</IconDialogButton>
                <IconDialogButton onClick={() => wsRef.current?.send('\x04')}>^D</IconDialogButton>
                <IconDialogButton onClick={() => wsRef.current?.send('\x0f')}>^O</IconDialogButton>
                <IconDialogButton onClick={() => wsRef.current?.send('\x12')}>^R</IconDialogButton>
                <IconDialogButton onClick={() => wsRef.current?.send('\x18')}>^X</IconDialogButton>
                <IconDialogButton onClick={() => wsRef.current?.send('\x1a')}>^Z</IconDialogButton>
              </div>
            </Focusable>
        }

        {
          config?.handheld_mode &&
            <Focusable style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', paddingTop: fullScreen ? '1em' : '2em' }}>
              <div className={staticClasses.Text}>Reserved for Virtual Keyboard</div>
              <div className={staticClasses.Label}>Disable Handheld mode to remove this padding</div>
            </Focusable>
        }
      </div>
    </Focusable>
  );
};

export default Terminal;
