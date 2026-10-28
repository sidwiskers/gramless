import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Gramless',
  description: 'Ultra-fast, zero-dependency, transactional Telegram Serverless framework',
  base: '/gramless/',
  cleanUrls: true,
  themeConfig: {
    siteTitle: 'Gramless',
    nav: [
      { text: 'Guide', link: '/guide/what-is-gramless' },
      { text: 'Reference', link: '/reference/context-api' },
      { text: 'Cookbook', link: '/cookbook/01-minimal-bot' },
      { text: 'Benchmarks', link: '/reference/benchmarks' },
      { text: 'GitHub', link: 'https://github.com/sidwiskers/gramless' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'What is Gramless?', link: '/guide/what-is-gramless' },
            { text: 'Quickstart', link: '/guide/getting-started' },
            { text: 'TGCloud Architecture', link: '/guide/architecture' },
          ],
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'Routing & Middleware', link: '/guide/routing' },
            { text: 'Context & Bot API', link: '/guide/context' },
            { text: 'Composable Filters', link: '/guide/filters' },
            { text: 'ACID Sessions', link: '/guide/sessions' },
            { text: 'Conversation Wizards (FSM)', link: '/guide/fsm' },
            { text: 'Mini App RPC Endpoints', link: '/guide/endpoints' },
          ],
        },
      ],
      '/reference/': [
        {
          text: 'API Reference',
          items: [
            { text: 'Context Methods', link: '/reference/context-api' },
            { text: 'Filter Predicates', link: '/reference/filter-api' },
            { text: 'Gramless Lab (Testkit)', link: '/reference/testkit' },
            { text: 'Scale Benchmarks', link: '/reference/benchmarks' },
          ],
        },
      ],
      '/cookbook/': [
        {
          text: 'Production Recipes',
          items: [
            { text: '01. Minimal Bot', link: '/cookbook/01-minimal-bot' },
            { text: '02. Database CRUD', link: '/cookbook/02-database-crud' },
            { text: '03. Onboarding Wizard', link: '/cookbook/03-onboarding-wizard' },
            { text: '04. Mini App RPC', link: '/cookbook/04-mini-app-rpc' },
            { text: '05. Telegram Stars', link: '/cookbook/05-telegram-stars' },
            { text: '06. Group Moderation', link: '/cookbook/06-group-moderation' },
            { text: '07. Lab Testing', link: '/cookbook/07-lab-testing' },
            { text: '08. Migration Guide', link: '/cookbook/08-migration-guide' },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/sidwiskers/gramless' },
    ],
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 sidwiskers',
    },
    search: {
      provider: 'local',
    },
  },
});
