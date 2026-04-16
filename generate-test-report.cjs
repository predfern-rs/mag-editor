const fs = require('fs');

const siteUrl = 'https://wordpress-1269845-4600687.cloudwaysapps.com';
const token = Buffer.from('paul@ridestore.com:Fu5I H5H4 AxG9 z7kq h0BQ bx39').toString('base64');

async function main() {
  const res = await fetch(siteUrl + '/wp-json/wp/v2/posts?per_page=25&lang=en&status=publish&_fields=id,title,slug,link,content', {
    headers: { Authorization: 'Basic ' + token },
  });
  const posts = await res.json();

  const articles = posts.map(p => {
    const content = p.content.rendered || '';
    const linkRegex = /<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const links = [];
    let m;
    while ((m = linkRegex.exec(content)) !== null) {
      links.push({ href: m[1], text: m[2].replace(/<[^>]+>/g, '').trim() });
    }
    return { slug: p.slug, title: p.title.rendered, url: p.link, links };
  });

  const slugs = articles.map(a => a.slug);
  let totalAdd = 0, totalKeep = 0, totalRemove = 0;
  articles.forEach(a => { totalKeep += a.links.length; totalAdd += 2; totalRemove += Math.min(1, a.links.length); });

  let html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>Staging EN Test Report - 2026-04-09</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: sans-serif; background:#f5f5f5; }
.container { max-width:1200px; margin:0 auto; padding:20px; }
.stats-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:16px; margin:20px 0; }
.stat-card { background:white; border-radius:8px; padding:16px; box-shadow:0 1px 3px rgba(0,0,0,.1); }
.stat-card .number { font-size:32px; font-weight:700; color:#2563eb; }
.stat-card .label { font-size:13px; color:#666; margin-top:4px; }
.cluster-card { background:white; border-radius:8px; padding:16px; margin:8px 0; box-shadow:0 1px 3px rgba(0,0,0,.1); }
.cluster-name { font-size:16px; font-weight:700; }
.cluster-stats { font-size:13px; color:#666; }
.article-card { background:white; border-radius:8px; padding:24px; margin:16px 0; box-shadow:0 1px 3px rgba(0,0,0,.1); }
.article-title { font-size:18px; font-weight:700; }
.article-url { font-size:12px; color:#888; }
.badges { display:flex; gap:6px; flex-wrap:wrap; margin:8px 0; }
.badge { display:inline-block; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:600; }
.badge-tof { background:#dbeafe; color:#1d4ed8; }
.badge-mof { background:#fef3c7; color:#92400e; }
.badge-bof { background:#d1fae5; color:#065f46; }
.badge-ski { background:#e0f2fe; color:#0369a1; }
.badge-outdoor { background:#dcfce7; color:#166534; }
.badge-pillar { background:#fef9c3; color:#854d0e; border:1px solid #fbbf24; }
.badge-supporting { background:#f1f5f9; color:#475569; }
.reasoning { background:#f8fafc; border-left:3px solid #2563eb; padding:12px 16px; margin:12px 0; font-size:14px; color:#334155; }
.link-section { margin:16px 0; }
.link-section h4 { font-size:14px; color:#666; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.5px; }
.link-item { padding:10px 12px; margin:6px 0; border-radius:6px; font-size:14px; }
.link-add { background:#f0fdf4; border:1px solid #bbf7d0; }
.link-keep { background:#f8fafc; border:1px solid #e2e8f0; }
.link-remove { background:#fef2f2; border:1px solid #fecaca; }
.link-item .action { font-weight:700; font-size:11px; text-transform:uppercase; margin-right:8px; }
.link-item .action-add { color:#16a34a; }
.link-item .action-keep { color:#64748b; }
.link-item .action-remove { color:#dc2626; }
.link-item .target { color:#2563eb; word-break:break-all; }
.link-item .anchor { font-weight:600; }
.link-item .why { color:#666; font-size:13px; margin-top:4px; }
.link-item .sentence { background:#fffbeb; padding:8px; border-radius:4px; margin-top:6px; font-size:13px; line-height:1.5; }
</style></head><body><div class="container">
<h1>Staging EN - Content Audit (Test)</h1>
<p style="color:#666;margin-bottom:24px;">Generated 2026-04-09 10:00 - Test report for staging EN articles</p>

<h2>Executive Summary</h2>
<div class="stats-grid">
  <div class="stat-card"><div class="number">${articles.length}</div><div class="label">Articles Audited</div></div>
  <div class="stat-card"><div class="number">${totalAdd}</div><div class="label">Article Links to ADD</div></div>
  <div class="stat-card"><div class="number">${totalKeep}</div><div class="label">Article Links to KEEP</div></div>
  <div class="stat-card"><div class="number">${totalRemove}</div><div class="label">Links to REMOVE</div></div>
  <div class="stat-card"><div class="number">5</div><div class="label">Shop Links to ADD</div></div>
  <div class="stat-card"><div class="number">10</div><div class="label">Shop Links to KEEP</div></div>
</div>

<h2>Clusters</h2>
<div class="cluster-card"><div class="cluster-name">Outdoor Adventures</div><div class="cluster-stats">Pillar: ${slugs[0] || 'test'} | 12 supporting articles</div></div>
<div class="cluster-card"><div class="cluster-name">Winter Sports Gear</div><div class="cluster-stats">Pillar: ${slugs[5] || 'test'} | 8 supporting articles</div></div>
<div class="cluster-card"><div class="cluster-name">Travel & Destinations</div><div class="cluster-stats">Pillar: ${slugs[10] || 'test'} | 5 supporting articles</div></div>

<h2>Per-Article Recommendations</h2>`;

  articles.forEach((a, i) => {
    const funnel = i % 3 === 0 ? 'tof' : i % 3 === 1 ? 'mof' : 'bof';
    const funnelLabel = funnel === 'tof' ? 'Pre-funnel / TOF' : funnel === 'mof' ? 'MOF' : 'BOF';
    const context = i % 2 === 0 ? 'ski' : 'outdoor';
    const role = i < 3 ? 'pillar' : 'supporting';
    const cluster = i < 8 ? 'Outdoor Adventures' : i < 16 ? 'Winter Sports Gear' : 'Travel & Destinations';

    html += `\n<div class="article-card" id="${a.slug}">
  <div class="article-header"><div>
    <div class="article-title">${a.title}</div>
    <div class="article-url">${a.url}</div>
  </div></div>
  <div class="badges">
    <span class="badge badge-${funnel}">${funnelLabel}</span>
    <span class="badge badge-${context}">${context}</span>
    <span class="badge badge-${role}">${role === 'pillar' ? 'Pillar' : 'Supporting'}</span>
    <span class="badge" style="background:#f1f5f9;color:#475569;">${cluster}</span>
  </div>
  <div class="reasoning">This ${role} article in the ${cluster} cluster needs internal linking improvements. As a ${funnelLabel} ${context} article, it should connect to related content for better topical authority.</div>`;

    // Existing links as KEEP + one REMOVE
    if (a.links.length > 0) {
      html += `\n  <div class="link-section"><h4>Article Links</h4>`;
      a.links.slice(0, 5).forEach(l => {
        html += `\n    <div class="link-item link-keep">
      <span class="action action-keep">KEEP</span>
      <span class="anchor">${l.text.substring(0, 50)}</span>
      <span class="target"> &rarr; ${l.href}</span>
      <div class="why">Existing link - editorially relevant to article topic</div>
    </div>`;
      });
      html += `\n  </div>`;

      // Remove section
      html += `\n  <div class="link-section"><h4>Links to Remove</h4>`;
      html += `\n    <div class="link-item link-remove">
      <span class="action action-remove">REMOVE</span>
      <span class="target">${a.links[0].href}</span>
      <div class="why">Low relevance - does not match ${funnelLabel} intent</div>
    </div>`;
      html += `\n  </div>`;
    }

    // ADD recommendations
    const others = articles.filter(o => o.slug !== a.slug);
    const toLink = others.slice(i % others.length, (i % others.length) + 2);
    if (toLink.length > 0) {
      html += `\n  <div class="link-section"><h4>Article Links</h4>`;
      toLink.forEach(other => {
        const anchor = other.title.toLowerCase().replace(/&amp;/g, '&').substring(0, 40);
        html += `\n    <div class="link-item link-add">
      <span class="action action-add">ADD</span>
      <span class="anchor">${anchor}</span>
      <span class="target"> &rarr; ${other.url}</span>
      <div class="why">Related ${cluster} content - strengthens cluster interlinking and topical authority</div>
      <div class="sentence">Check out our guide on [${anchor}](${other.url}) for more tips and recommendations.</div>
    </div>`;
      });
      html += `\n  </div>`;
    }

    html += `\n</div>`;
  });

  html += '\n</div></body></html>';

  const outPath = 'C:/Users/jpred/Documents/Claude Projects/ridestore/RS-tech-seo/mag-editor/test-report.html';
  fs.writeFileSync(outPath, html);
  console.log('Test report saved to:', outPath);
  console.log('Articles:', articles.length, '| ADD:', totalAdd, '| KEEP:', totalKeep, '| REMOVE:', totalRemove);
}

main().catch(e => console.error(e));
