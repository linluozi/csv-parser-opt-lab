"""Figure 2 - the arithmetic ceiling: writeRow cannot deliver the claimed gain."""
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

BG    = '#FAF6F0'
PANEL = '#FFFFFF'
INK   = '#2B1D14'
INK2  = '#6B584A'
AMBER = '#C9922F'
TERRA = '#B5502A'
TEAL  = '#3D6B6B'
GREY  = '#B9AA98'
GRID  = '#E3D9CC'

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13.2, 5.4), dpi=170,
                                gridspec_kw={'width_ratios': [1, 1.35], 'wspace': 0.28})
fig.patch.set_facecolor(BG)

# ---------------- left: writeRow cost share ----------------
ax1.set_facecolor(BG)
labels = ['headers\n(identical\nrows)', 'headers\n(per-row\ndistinct)', 'headers:\nfalse']
share = [9.6, 11.2, 13.1]
bars = ax1.bar(labels, share, width=0.58, color=[GREY, GREY, TEAL],
               edgecolor=INK, linewidth=1.0, zorder=3)
ax1.axhline(100, color=GRID, lw=1.0, zorder=1)
for b, v in zip(bars, share):
    ax1.text(b.get_x() + b.get_width() / 2, v + 1.2, f'{v}%',
             ha='center', fontsize=11.5, fontweight='bold', color=INK)

ax1.set_ylim(0, 108)
ax1.set_ylabel('writeRow as % of full parse time', fontsize=10.5, color=INK2)
ax1.tick_params(axis='x', labelsize=9.5, colors=INK, length=0)
ax1.tick_params(axis='y', labelsize=9, colors=INK2)
for s in ('top', 'right'):
    ax1.spines[s].set_visible(False)
for s in ('left', 'bottom'):
    ax1.spines[s].set_color(GRID)
ax1.grid(axis='y', color=GRID, lw=0.8, zorder=0)
ax1.set_axisbelow(True)
ax1.set_title('90% of the cost is somewhere else', fontsize=12.5, color=INK,
              fontweight='bold', pad=12, loc='left')
ax1.text(0.02, 0.06, 'measured by hollowing out the method',
         transform=ax1.transAxes, fontsize=8.8, color=INK2)

# ---------------- right: claimed vs ceiling ----------------
ax2.set_facecolor(BG)

names = ['headers', 'headers:false']
claimed = [2.73, 3.97]
ceiling = [0.28, 2.17]
isolated = [1.03, 1.20]

y = np.arange(len(names))
h = 0.32

b1 = ax2.barh(y + h / 2 + 0.02, claimed, height=h, color=AMBER,
              edgecolor=INK, linewidth=1.0, zorder=3, label='claimed gain')
b2 = ax2.barh(y - h / 2 - 0.02, ceiling, height=h, color=TERRA,
              edgecolor=INK, linewidth=1.0, zorder=3, label='arithmetic ceiling')

for b, v in zip(b1, claimed):
    ax2.text(v + 0.08, b.get_y() + b.get_height() / 2, f'{v:.2f}%',
             va='center', fontsize=11, fontweight='bold', color=AMBER)
for b, v in zip(b2, ceiling):
    ax2.text(v + 0.08, b.get_y() + b.get_height() / 2, f'{v:.2f}%',
             va='center', fontsize=11, fontweight='bold', color=TERRA)

# required isolated speedup marker for the claimed number
# claimed = share x (1 - 1/s)  =>  s = share / (share - claimed)
for i, (c, s_share) in enumerate(zip(claimed, share)):
    need = s_share / (s_share - c)
    ybar = y[i] + h / 2 + 0.02
    ax2.plot([need], [ybar], marker='D', ms=10,
             color=INK, zorder=5, mec='white', mew=1.4)
    ax2.annotate(f'needs writeRow\nto be {need:.2f}× faster\n(measured: {isolated[i]:.2f}×)',
                 xy=(need, ybar), xytext=(need + 1.5, ybar + 0.42),
                 fontsize=8.8, color=INK, fontweight='bold', ha='left', va='bottom',
                 arrowprops=dict(arrowstyle='-', color=INK, lw=1.0,
                                 connectionstyle='arc3,rad=-0.15'))

ax2.set_yticks(y)
ax2.set_yticklabels(names, fontsize=11, color=INK)
ax2.set_xlim(0, 12.2)
ax2.set_ylim(-0.62, 2.35)
ax2.set_xlabel('end-to-end gain (%)', fontsize=10.5, color=INK2)
ax2.tick_params(axis='x', labelsize=9, colors=INK2)
ax2.tick_params(axis='y', length=0)
for s in ('top', 'right', 'left'):
    ax2.spines[s].set_visible(False)
ax2.spines['bottom'].set_color(GRID)
ax2.grid(axis='x', color=GRID, lw=0.8, zorder=0)
ax2.set_axisbelow(True)
ax2.legend(loc='lower right', frameon=True, facecolor=PANEL, edgecolor=GRID, fontsize=10)
ax2.set_title('The claimed gain exceeds what the hot path can deliver',
              fontsize=12.5, color=INK, fontweight='bold', pad=12, loc='left')
ax2.text(0, -0.30, '◆ = the isolated speedup that would be required to deliver the claimed gain',
         transform=ax2.transAxes, fontsize=8.8, color=INK2)

fig.suptitle('writeRow() is 9.6% of the parse — a 2.73% end-to-end win needs it 1.40× faster, not 1.03×',
             fontsize=13.8, color=INK, fontweight='bold', x=0.008, ha='left', y=0.995)

fig.text(0.008, 0.012,
         'csv-parser 3.2.1 · ceiling = share × (1 − 1/isolated speedup) · measured share from hollowing; isolated speedup from best-of-N isolation',
         fontsize=8.6, color=INK2)

plt.subplots_adjust(left=0.075, right=0.985, top=0.82, bottom=0.13, wspace=0.30)
plt.savefig('docs/img/02-ceiling.png', facecolor=BG, bbox_inches='tight')
print('saved 02-ceiling.png')
