import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import zhCommon from './locales/zh/common.json'
import zhSidebar from './locales/zh/sidebar.json'
import zhEditor from './locales/zh/editor.json'
import zhTerminal from './locales/zh/terminal.json'
import zhGraph from './locales/zh/graph.json'
import zhCommands from './locales/zh/commands.json'
import zhTemplates from './locales/zh/templates.json'
import zhHelp from './locales/zh/help.json'
import zhWelcome from './locales/zh/welcome.json'
import zhCli from './locales/zh/cli.json'
import zhAgent from './locales/zh/agent.json'
import zhDesktop from './locales/zh/desktop.json'

import enCommon from './locales/en/common.json'
import enSidebar from './locales/en/sidebar.json'
import enEditor from './locales/en/editor.json'
import enTerminal from './locales/en/terminal.json'
import enGraph from './locales/en/graph.json'
import enCommands from './locales/en/commands.json'
import enTemplates from './locales/en/templates.json'
import enHelp from './locales/en/help.json'
import enWelcome from './locales/en/welcome.json'
import enCli from './locales/en/cli.json'
import enAgent from './locales/en/agent.json'
import enDesktop from './locales/en/desktop.json'

const resources = {
  zh: {
    common: zhCommon,
    sidebar: zhSidebar,
    editor: zhEditor,
    terminal: zhTerminal,
    graph: zhGraph,
    commands: zhCommands,
    templates: zhTemplates,
    help: zhHelp,
    welcome: zhWelcome,
    cli: zhCli,
    agent: zhAgent,
    desktop: zhDesktop
  },
  en: {
    common: enCommon,
    sidebar: enSidebar,
    editor: enEditor,
    terminal: enTerminal,
    graph: enGraph,
    commands: enCommands,
    templates: enTemplates,
    help: enHelp,
    welcome: enWelcome,
    cli: enCli,
    agent: enAgent,
    desktop: enDesktop
  }
}

const savedLanguage = localStorage.getItem('metamates-language') || 'zh'

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: savedLanguage,
    fallbackLng: 'zh',
    defaultNS: 'common',
    ns: ['common', 'sidebar', 'editor', 'terminal', 'graph', 'commands', 'templates', 'help', 'welcome', 'cli', 'agent', 'desktop'],
    interpolation: {
      escapeValue: false
    }
  })

export default i18n
