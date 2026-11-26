const OVERLAY_TEMPLATE = `
<style>
canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;pointer-events:none}
[role=status]{position:absolute;top:8px;left:50%;transform:translateX(-50%);width:max-content;max-width:calc(100% - 32px);box-sizing:border-box;background:#fff;color:#262626;border:1px solid #bcbcbc;border-radius:5px;box-shadow:0 2px 8px #0002;padding:5px 9px;font:13px/1.4 system-ui,sans-serif;pointer-events:none}
</style>
<canvas tabindex="-1" aria-hidden="true"></canvas>
<div role="status" hidden></div>`;

const OPTIONS_TEMPLATE = `
<style>
:host{display:block;font:13px/1.4 system-ui,sans-serif;color:#303030;text-align:left}
:host([hidden]){display:none}
*,*::before,*::after{box-sizing:border-box}
[hidden]{display:none!important}
.bar,.row{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.bar{justify-content:space-between;margin-bottom:6px}
button,select,input{font:inherit}
button,select{min-height:30px;border-radius:4px;border:1px solid #bcbcbc;background:white;color:#303030;padding:3px 7px;cursor:pointer}
button:hover:enabled{background:#f4f4f4;border-color:#888}
button:disabled{opacity:.45;cursor:default}
button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #126253;outline-offset:2px}
.block{margin-top:8px;padding-top:8px;border-top:1px solid #ccc}
.pair{display:flex;align-items:center;justify-content:space-between;gap:8px}
.pair+label,.pair+.pair,.row+.pair,.pair+.row{margin-top:6px}
.pair input[type=range]{flex:1;min-width:55px;max-width:125px}
.pair input[type=color],.row input[type=color]{width:40px;height:33px;padding:2px;cursor:pointer}
.pair select{min-width:0;max-width:65%}
p{margin:5px 0}
[data-rail]{height:23px;position:relative;border:1px solid #a4afa6;margin:10px 10px 14px;cursor:crosshair}
[data-rail] button{position:absolute;top:10px;transform:translateX(-50%);width:17px;min-height:19px;padding:0;border:2px solid white;border-radius:7px;box-shadow:0 0 0 1px #345}
[data-rail] button[aria-pressed=true]{outline:2px solid #18352c;outline-offset:2px}
[data-use]{display:none}
@media(max-width:1000px){[data-use]{display:inline-block}}
</style>
<section class="panel">
 <div class="bar">
  <strong data-active></strong>
  <button type="button" data-end data-ru="Выйти">Exit tool</button>
 </div>
 <button type="button" data-use data-ru="Перейти к холсту">Return to canvas</button>
 <div class="row" data-polygon-options hidden>
  <button type="button" hidden data-back data-ru="Шаг назад">Undo point</button>
  <button type="button" hidden data-finish data-ru="Готово">Finish</button>
 </div>
  <label class="pair" data-combine-label><span data-ru="Выделение">Selection</span>
   <select data-combine>
    <option value="replace" data-ru="Заменить">Replace</option>
    <option value="add" data-ru="Добавить">Add</option>
    <option value="subtract" data-ru="Вычесть">Subtract</option>
    <option value="intersect" data-ru="Пересечь">Intersect</option>
   </select>
  </label>
  <div class="block" data-wand-options hidden>
   <p data-ru="Коснитесь цвета на активном слое. Допуск можно менять после выбора.">Tap a color on the active layer. You can adjust the tolerance after picking.</p>
   <label class="pair"><span data-ru="Допуск">Tolerance</span><input data-tolerance type="range" min="0" max="255" value="24"><output data-tolerance-value>24</output></label>
   <label><input data-contiguous type="checkbox" checked><span data-ru="Только смежные пиксели">Contiguous pixels only</span></label>
  </div>
  <div class="block" data-gradient-options hidden>
   <p data-ru="Проведите линию от начала градиента до его конца.">Drag from the start of the gradient to its end.</p>
   <label class="pair"><span data-ru="Вид">Type</span><select data-kind><option value="linear" data-ru="Линейный">Linear</option><option value="radial" data-ru="Радиальный">Radial</option></select></label>
   <label class="pair"><span data-ru="Пресет">Preset</span><select data-preset></select></label>
   <div data-rail></div>
   <label class="pair"><span data-ru="Цвет точки">Stop color</span><input data-stop-color type="color"></label>
   <label class="pair"><span data-ru="Положение">Position</span><input data-position type="range" min="0" max="100"><output data-stop-value></output></label>
   <div class="row"><button data-add-stop data-ru="Добавить точку">Add stop</button><button data-remove data-ru="Удалить точку">Remove stop</button></div>
   <div class="block row"><button data-save-preset data-ru="Сохранить пресет">Save preset</button><button data-rename-preset data-ru="Переименовать">Rename</button><button data-delete-preset data-ru="Удалить">Delete</button></div>
  </div>
  <div class="row block" data-selection-actions><label><span data-ru="Цвет заливки">Fill color</span> <input type="color" data-fill-color value="#42764f"></label>
   <button type="button" disabled data-fill data-ru="Залить">Fill selection</button>
   <button type="button" disabled data-erase data-ru="Стереть">Erase selection</button>
   <button type="button" disabled data-clear data-ru="Снять выделение">Deselect</button>
  </div>
</section>
`;
