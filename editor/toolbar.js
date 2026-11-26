const toolIcons = {
  polygon: '<path d="m4 17 4-13 13 6-4 10Z" stroke-dasharray="2 2"/><g fill="white"><path d="M2.5 15.5h3v3h-3zM6.5 2.5h3v3h-3zM19.5 8.5h3v3h-3zM15.5 18.5h3v3h-3z"/></g>',
  wand: '<path d="m3 19 11-11 2.6 2.6-11 11z" fill="currentColor"/><path d="m12.7 12.5 2.5 2.5" stroke="white"/><path d="m9 3 .6 1.8L11.5 5l-1.9.6L9 7.5l-.6-1.9L6.5 5l1.9-.2ZM18 2l.7 2.3L21 5l-2.3.7L18 8l-.7-2.3L15 5l2.3-.7ZM20 12v4m-2-2h4" stroke-width="1.2"/>',
  gradient: '<defs><linearGradient id="le-tool-ramp" x2="1" y2=".4" gradientUnits="objectBoundingBox"><stop stop-color="#303030"/><stop offset="1" stop-color="white"/></linearGradient></defs><rect x="2" y="4.5" width="20" height="15" rx="1.5" fill="url(#le-tool-ramp)"/>',
};

function createToolButtons(toolbar, tr, chooseTool) {
  const items = [
    ['polygon', tr('Polygon','Многоугольник'), tr('Click to place vertices. Click the first vertex to finish.','Ставьте вершины щелчком. Нажмите на первую, чтобы замкнуть контур.'), 'lasso'],
    ['wand', tr('Magic wand','Волшебная палочка'), tr('Select pixels of a similar color.','Нажмите на цвет, чтобы выделить похожие пиксели.'), 'polygon'],
    ['gradient', tr('Gradient','Градиент'), tr('Drag to blend colors across the layer or selection.','Проведите линию, чтобы растянуть цвета по слою или выделению.'), 'fillbrush'],
  ];
  return items.map(([name, label, hint, after]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'one_tool';
    button.dataset.leTool = name;
    button.title = label + ' — ' + hint;
    button.setAttribute('aria-label', label);
    button.innerHTML = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">' + toolIcons[name] + '</svg>';
    button.onclick = event => {
      // The native delegated click handler only knows LONETI's own tool IDs.
      event.stopPropagation();
      chooseTool(name);
    };
    const neighbor = toolbar.querySelector('[data-tool="'+after+'"],[data-le-tool="'+after+'"]');
    if (neighbor) neighbor.after(button);
    else toolbar.append(button);
    return button;
  });
}

const TOOLBAR_STYLE = `
#tools > button[data-le-tool]{appearance:none;box-sizing:inherit;padding:0;color:#383838;display:inline-grid;place-items:center}
#tools > button[data-le-tool] svg{width:80%;height:80%;pointer-events:none}
#tools > button[data-le-tool][aria-pressed=true]{background-color:#d2d2d2;border-color:#999}
#tools > button[data-le-tool]:focus-visible{outline:2px solid #126253;outline-offset:1px}
[data-le-custom-active] .one_tool.active_tool{background-color:#f0f0f0;border-color:#dcdcdc}
#cont_config[data-le-custom-active] > .one_config{display:none}
`;
