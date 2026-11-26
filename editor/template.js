const TOOLS_TEMPLATE = `
<style>
:host{font:14px/1.35 system-ui,sans-serif;color:#18352c}
*,*::before,*::after{box-sizing:border-box}
[hidden]{display:none!important}
canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;pointer-events:none}
.dock{position:absolute;top:6px;right:6px;max-width:calc(100% - 12px);pointer-events:none}
.bar,.panel,[role=status]{pointer-events:auto;background:#fcfff9;box-shadow:0 2px 10px #172c2740;border:1px solid #a1b7a7;border-radius:8px}
.bar,.row{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.bar{width:fit-content;margin-left:auto;padding:3px}
button,select,input{font:inherit}
button,select{min-height:34px;border-radius:5px;border:1px solid #abbbb0;background:white;color:#24372e;padding:4px 8px;cursor:pointer}
button:disabled{opacity:.45;cursor:default}
button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #126253;outline-offset:2px}
button[aria-pressed=true],[data-menu][aria-expanded=true]{background:#215d4c;border-color:#215d4c;color:white}
[data-menu]{font-weight:650;background:#edf5e9}
[data-active]:empty{display:none}
.panel{width:min(315px,100%);max-height:calc(100dvh - 176px);overflow:auto;overscroll-behavior:contain;margin:4px 0 0 auto;padding:10px}
.dock{width:min(380px,calc(100% - 12px))}
.block{margin-top:8px;padding-top:8px;border-top:1px solid #d4dfd5}
.pair{display:flex;align-items:center;justify-content:space-between;gap:8px}
.pair+label,.pair+.pair,.row+.pair,.pair+.row{margin-top:6px}
.pair input[type=range]{flex:1;min-width:55px;max-width:125px}
.pair input[type=color],.row input[type=color]{width:40px;height:33px;padding:2px;cursor:pointer}
.pair select{min-width:0;max-width:65%}
p{margin:5px 0}
[data-rail]{height:23px;position:relative;border:1px solid #a4afa6;margin:10px 10px 14px;cursor:crosshair}
[data-rail] button{position:absolute;top:10px;transform:translateX(-50%);width:17px;min-height:19px;padding:0;border:2px solid white;border-radius:7px;box-shadow:0 0 0 1px #345}
[data-rail] button[aria-pressed=true]{outline:2px solid #18352c;outline-offset:2px}
[role=status]{position:absolute;top:100%;right:0;margin-top:5px;padding:5px 9px;max-width:min(315px,100%);font-size:13px;pointer-events:none}
@media(max-height:480px){.panel{max-height:calc(100dvh - 150px)}}
</style>
<canvas tabindex="-1" aria-hidden="true"></canvas>
<div class="dock">
 <div class="bar">
  <button type="button" data-menu aria-controls="drawing-controls" data-ru="Инструменты рисования">Drawing tools</button>
  <span data-active></span>
  <button type="button" hidden data-back data-ru="Шаг назад">Undo point</button>
  <button type="button" hidden data-finish data-ru="Готово">Finish</button>
  <button type="button" hidden data-end data-ru="Выйти">Exit tool</button>
 </div>
 <div class="panel" id="drawing-controls" hidden>
  <div class="row">
   <button type="button" data-tool="polygon" data-ru="Многоугольник">Polygon</button>
   <button type="button" data-tool="wand" data-ru="Волшебная палочка">Magic wand</button>
   <button type="button" data-tool="gradient" data-ru="Градиент">Gradient</button>
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
   <div class="row"><button data-use data-ru="Выбрать на холсте">Pick on canvas</button></div>
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
   <div class="block row"><button data-use data-ru="Рисовать на холсте">Draw on canvas</button></div>
  </div>
  <div class="row block"><label><span data-ru="Цвет заливки">Fill color</span> <input type="color" data-fill-color value="#42764f"></label>
   <button type="button" disabled data-fill data-ru="Залить">Fill selection</button>
   <button type="button" disabled data-erase data-ru="Стереть">Erase selection</button>
   <button type="button" disabled data-clear data-ru="Снять выделение">Deselect</button>
  </div>
 </div>
 <div role="status" hidden></div>
</div>
`;
