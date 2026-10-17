"""Figure 1 - the headline number is one draw from a wide distribution."""
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

# warm editorial palette (per project convention: espresso brown + amber gold + terracotta)
BG      = '#FAF6F0'
PANEL   = '#FFFFFF'
INK     = '#2B1D14'
INK2    = '#6B584A'
AMBER   = '#C9922F'
TERRA   = '#B5502A'
TEAL    = '#3D6B6B'
GRID    = '#E3D9CC'

runs = [-25.32, -22.82, -25.34, 7.09, 7.13, 7.89, -3.88, -4.57, -2.28, -8.69, 17.39, 7.70]
n = len(runs)
x = np.arange(1, n + 1)
neg = [r < 0 for r in runs]

fig, ax = plt.subplots(figsize=(11.5, 5.6), dpi=170)
fig.patch.set_facecolor(BG)
ax.set_facecolor(BG)

bars = ax.bar(x, runs, width=0.62, zorder=3,
              color=[TERRA if v < 0 else TEAL for v in runs],
              edgecolor=INK, linewidth=0.9)

ax.axhline(0, color=INK, lw=1.3, zorder=4)
ax.axhline(2.73, color=AMBER, lw=2.4, ls='-', zorder=5)
ax.axhline(-2.28, color=INK2, lw=1.5, ls='--', zorder=5)

ax.text(n + 0.35, 2.73, ' claimed +2.73%', color=AMBER, va='center', ha='left',
        fontsize=11.5, fontweight='bold')
ax.text(n + 0.35, -2.28, ' median −2.28%', color=INK2, va='center', ha='left', fontsize=10.5)
ax.text(n + 0.35, 0, '', va='center', ha='left')

for xi, v in zip(x, runs):
    ax.text(xi, v + (1.5 if v >= 0 else -1.5), f'{v:+.1f}%',
            ha='center', va='bottom' if v >= 0 else 'top',
            fontsize=8.6, color=INK, fontweight='bold')

ax.set_xlim(0.3, n + 3.6)
ax.set_ylim(-31, 26)
ax.set_xticks(x)
ax.set_xticklabels([f'{i}' for i in x], fontsize=9.5, color=INK2)
ax.set_xlabel('independent run of the same benchmark script', fontsize=11, color=INK2, labelpad=8)
ax.set_ylabel('end-to-end change (%)', fontsize=11, color=INK2)
ax.tick_params(axis='y', labelsize=9.5, colors=INK2)
for s in ('top', 'right'):
    ax.spines[s].set_visible(False)
for s in ('left', 'bottom'):
    ax.spines[s].set_color(GRID)
ax.grid(axis='y', color=GRID, lw=0.8, zorder=0)
ax.set_axisbelow(True)

# summary strip
ax.text(0.012, 0.955,
        '7 of 12 runs are negative   ·   mean −3.81% ± 13.76   ·   range −25.3% … +17.4%',
        transform=ax.transAxes, fontsize=11, color=INK, fontweight='bold', va='top',
        bbox=dict(boxstyle='round,pad=0.5', facecolor=PANEL, edgecolor=GRID, lw=1.1))

ax.set_title('The reported 2.73% is one sample from a distribution centred below zero',
             fontsize=13.5, color=INK, fontweight='bold', pad=16, loc='left')

fig.text(0.008, 0.015,
         'csv-parser 3.2.1 · writeRow() optimization · 180,000 rows × 8 cols · Node v22.22.2 · Windows x64',
         fontsize=8.6, color=INK2)

plt.tight_layout(rect=[0, 0.035, 1, 1])
plt.savefig('docs/img/01-claim-vs-distribution.png', facecolor=BG, bbox_inches='tight')
print('saved 01-claim-vs-distribution.png')
