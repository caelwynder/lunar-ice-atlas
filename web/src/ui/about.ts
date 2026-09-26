import { el } from './legend';

const CREDITS: [string, string, string][] = [
  ['NASA SVS CGI Moon Kit', 'https://svs.gsfc.nasa.gov/4720', "NASA's Goddard Space Flight Center"],
  [
    'NASA/IBM Lunar Foundation Model (NI-LFM)',
    'https://huggingface.co/nasa-ibm-ai4science/Ice-Prospectivity-NASA-IBM-Lunar-Foundation-Model',
    'Apache-2.0',
  ],
  [
    'SomBench ice-prospectivity dataset',
    'https://huggingface.co/datasets/nasa-ibm-ai4science/Sombench-Ice-Prospectivity-Regression',
    'CC-BY-4.0',
  ],
  ['PDS LOLA gridded topography', 'https://pds-geosciences.wustl.edu/missions/lro/lola.htm', 'NASA PDS'],
  ['USGS Artemis candidate region grids', 'https://doi.org/10.5066/P1MEQ6UK', 'CC0'],
  ['Three.js', 'https://threejs.org', 'MIT'],
];

function link(text: string, href: string): HTMLAnchorElement {
  const a = el('a', '', text);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

function credits(): HTMLElement {
  const list = el('ul', 'credits');
  for (const [name, href, note] of CREDITS) {
    const item = el('li');
    item.append(link(name, href), ` (${note})`);
    list.append(item);
  }
  return list;
}

function caveats(rmse: string): HTMLElement {
  const list = el('ul');
  const items = [
    '“The target is a knowledge-driven model, not measured ice.”',
    'Model outputs “shouldn’t substitute for instrumental measurements or operational decision-making regarding lunar landing sites.”',
    'Vertical exaggeration ×6.',
    `Most polar patches were used to train the model; accuracy (RMSE ${rmse}) is measured on the 25 held-out test patches outlined when “Show held-out test patches” is on.`,
    'About 9% of each polar cap has no model coverage in the benchmark (blank crescent).',
  ];
  items.forEach((text) => list.append(el('li', '', text)));
  return list;
}

export function renderAbout(dialog: HTMLDialogElement, rmse: string): void {
  const close = el('button', 'close', 'Close');
  close.type = 'button';
  close.addEventListener('click', () => dialog.close());
  const title = el('h2', '', 'About the Lunar Ice Atlas');
  title.id = 'about-title';
  dialog.replaceChildren(
    title,
    el('p', '', 'Colours near the poles show modelled ice prospectivity, not measured ice.'),
    caveats(rmse),
    el('h3', '', 'Credits'),
    credits(),
    close,
  );
}
