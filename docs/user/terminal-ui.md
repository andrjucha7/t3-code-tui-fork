# Terminal UI

`t3 tui` runs T3 Code full-screen in your terminal, with an explorer, a chat
pane, a composer and a command palette. It connects to a T3 Code server that is
already running on the same machine. Threads, projects and providers are the same
ones the graphical app shows, and you can switch between the two at any time.

## Start it

1. Start a server: run `t3` to open the graphical app, or run `t3 serve` to start
   one without a window.
2. In any terminal, run `t3 tui`.

Use `--base-dir` to choose which T3 Code data directory to use, as you would for
`t3 pair`.

## Switch between the terminal and the GUI

- To open the graphical app from the TUI, press Ctrl+O or choose **Open in GUI**.
  If the desktop app is running, T3 Code activates it. Otherwise it opens a
  signed-in browser tab.
- To go back, run `t3 tui` again. Quitting the TUI leaves the server and the GUI
  running.

## Keys

| Key         | Action                                                  |
| ----------- | ------------------------------------------------------- |
| Ctrl+P      | Command palette                                         |
| Ctrl+N      | New thread in the current project                       |
| Ctrl+G      | Go to a thread                                          |
| Ctrl+T      | Change model (every enabled provider, Pi included)      |
| Shift+Tab   | Toggle plan mode                                        |
| Ctrl+B      | Show or hide the explorer                               |
| Tab         | Move focus between the explorer and composer            |
| PgUp / PgDn | Scroll the conversation                                 |
| Enter       | Send. End a line with `\` or press Ctrl+J for a newline |
| Esc         | Interrupt the running turn                              |
| 1–9         | Answer an approval or question                          |
| Ctrl+C      | Clear the composer, or quit when it is empty            |

To add the current directory as a project, open the palette and choose
**Add project (current directory)**. To change the approval mode, archive a
thread or stop its session, use the command palette.
