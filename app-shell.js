// Shared sidebar for every authenticated app page. Renders into
// <aside id="appSidebar"></aside>, using <body data-page="..."> to mark the
// active link. Having 12 pages hand-copy this markup was asking for drift,
// so it's templated once here instead.
(function () {
  const ICONS = {
    dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>',
    assistant: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"/></svg>',
    reports: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17V9m4 8V5m4 12v-6M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>',
    analytics: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>',
    customers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
    orders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.4a2 2 0 002 1.6h9.72a2 2 0 002-1.6L23 6H6"/></svg>',
    tasks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>',
    support: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"/><path d="M9 10h.01M12 10h.01M15 10h.01"/></svg>',
    workflows: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4m0 12v4m10-10h-4M6 12H2m15.36-6.36l-2.83 2.83M9.47 14.53l-2.83 2.83m0-10.83l2.83 2.83m5.06 5.07l2.83 2.83"/></svg>',
    integrations: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 00-2 2v3m0 8v3a2 2 0 002 2h3m8 0h3a2 2 0 002-2v-3m0-8V5a2 2 0 00-2-2h-3"/></svg>',
    team: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="7" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7"/><circle cx="17" cy="7" r="3"/><path d="M23 21c0-3-2-5.5-5-6.5"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.6V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.6 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.6-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.6-1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3h0a1.7 1.7 0 001-1.6V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.6 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9v0a1.7 1.7 0 001.6 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.6 1z"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>',
  };

  const NAV_SECTIONS = [
    {
      items: [
        { href: "dashboard.html", label: "Dashboard", icon: "dashboard" },
        { href: "ai-assistant.html", label: "AI Assistant", icon: "assistant" },
        { href: "mis-report.html", label: "MIS Reports", icon: "reports" },
        { href: "analytics.html", label: "Analytics", icon: "analytics" },
      ],
    },
    {
      label: "Operations",
      items: [
        { href: "customers.html", label: "Customers", icon: "customers" },
        { href: "orders.html", label: "Orders", icon: "orders" },
        { href: "tasks.html", label: "Tasks", icon: "tasks" },
        { href: "support.html", label: "Support", icon: "support" },
        { href: "workflows.html", label: "Workflows", icon: "workflows" },
      ],
    },
    {
      label: "Organization",
      items: [
        { href: "integrations.html", label: "Integrations", icon: "integrations" },
        { href: "team.html", label: "Team", icon: "team" },
        { href: "settings.html", label: "Settings", icon: "settings" },
      ],
    },
  ];

  function renderSidebar() {
    const mount = document.getElementById("appSidebar");
    if (!mount) return;
    const current = document.body.dataset.page;

    let nav = "";
    NAV_SECTIONS.forEach((section) => {
      if (section.label) nav += `<span class="side-label">${section.label}</span>`;
      section.items.forEach((item) => {
        const activeCls = item.href === current ? ' class="active"' : "";
        nav += `<a href="${item.href}"${activeCls}>${ICONS[item.icon]}${item.label}</a>`;
      });
    });

    mount.innerHTML = `
      <a href="index.html" class="brand">
        <span class="brand-mark"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h8l-1 8 10-12h-8l1-8z"/></svg></span>
        Business Assistant
      </a>
      <nav class="side-nav">${nav}</nav>
      <div class="side-footer">
        <div class="avatar" data-user-initials>AM</div>
        <div><div class="name" data-user-name>Alex Morgan</div><div class="role" data-user-role>Operations Lead</div></div>
        <button class="icon-btn" data-logout title="Log out" style="margin-left:auto;color:var(--slate-400);">${ICONS.logout}</button>
      </div>
    `;

    if (window.applyUserInfo) window.applyUserInfo(mount);
  }

  document.addEventListener("DOMContentLoaded", renderSidebar);
})();
