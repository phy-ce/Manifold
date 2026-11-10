// Languages. Korean is the source text, so a string is its own key and English is looked up from it.
export type Language = "ko" | "en";

let language: Language = "ko";

export const setLanguage = (next: Language): void => {
  language = next;
};
export const getLanguage = (): Language => language;
export const dateLocale = (): string => (language === "en" ? "en-US" : "ko-KR");

export const tr = (text: string): string => (language === "ko" ? text : EN[text] ?? text);

/** Translates every string in a block of game data. */
export function localize<T>(value: T): T {
  if (typeof value === "string") return tr(value) as T;
  if (Array.isArray(value)) return value.map(localize) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, localize(item)])) as T;
  }
  return value;
}

const RESTART_KEY = "modpack-simulator-restart";
const LANGUAGE_KEY = "modpack-simulator-language";

/** The language to keep, if the game reloaded itself rather than being opened by the player. */
export function keptLanguage(): Language | null {
  try {
    if (!sessionStorage.getItem(RESTART_KEY)) return null;
    sessionStorage.removeItem(RESTART_KEY);
    const saved = sessionStorage.getItem(LANGUAGE_KEY);
    return saved === "en" || saved === "ko" ? saved : null;
  } catch {
    return null;
  }
}

/** Reloads the game without asking for the language again. */
export function restart(): void {
  try {
    sessionStorage.setItem(RESTART_KEY, "1");
    sessionStorage.setItem(LANGUAGE_KEY, language);
  } catch {
    // Without storage the player just picks the language again.
  }
  location.reload();
}

export const EN: Record<string, string> = {
  // Top bar and general
  "새 게임": "New game", "도감": "Index", "저장": "Save", "배속": "x speed", "일시정지": "Pause",
  "테스트 시작": "Test start",
  "새 월드에서 지금까지 만든 단계가 모두 열린 채 시작합니다. 모든 광석과 금속, 부품, 기계 2대씩, 장비 한 벌, 선 재료가 있고, 모든 바이옴이 보이도록 지도를 넓게 밝혀 둡니다": "Starts on a new world with every stage so far open: every ore and metal, parts, two of every machine, a full set of gear, line materials, and the map shown wide enough to see every biome",
  "메뉴": "Menu", "메뉴 (Esc)": "Menu (Esc)",
  "정말 초기화?": "Really reset?", "조작 도움말 (단축키 ?)": "Controls (shortcut ?)", "조작 도움말": "Controls",
  "단축키 G": "Shortcut G", "단축키 M": "Shortcut M", "인벤토리": "Inventory", "정렬": "Sort", "버리기": "Trash",
  "들고 있는 아이템을 버립니다": "Throws away the held item", "계속하기": "Continue", "지도": "Map", "기지로": "To base",
  "기지로 복귀": "Return to base", "목표": "Goal", "년차": " yr", "쇠약": "Weak", "초": "s", "체력": "HP", "허기": "Food",
  "무게": "Load",
  "쓰러졌습니다. 잃은 재료:": "You collapsed. Lost:", "쓰러졌습니다.": "You collapsed.", "완료": "complete",
  "다음 단계:": "Next stage:", "은 아직 준비 중입니다.": " isn't ready yet.",
  // Slot roles
  "연료": "Fuel", "재료": "Material", "결과": "Result", "부산물": "By-product",
  // Item sources
  "지도의 광맥에서 캡니다": "Mined from veins on the map", "지도에서 채집합니다": "Foraged on the map",
  "강가에서 펌프로 끌어옵니다": "Pumped from a riverbank",
  "빈 드럼통을 들고 펌프의 출력을 눌러 채웁니다": "Hold an empty drum and click a pump's output to fill it",
  // Seasons
  "봄": "Spring", "여름": "Summer", "가을": "Autumn", "겨울": "Winter",
  // Build window
  "닫기": "Close", "건설 작업": "Build work", "착수": "Start", "착수 취소": "Cancel", "청사진": "Blueprint",
  "기계 없이 자리만 잡아 둡니다": "Reserves the spot without a machine", "착수량": "Work", "설치 (보유": "Install (have",
  // Machine states
  "출력 막힘": "Output blocked", "작업 대기": "Needs work", "가동 중": "Running", "재료 부족": "Missing materials",
  // Board tools
  "모든 선": "All lines", "동력": "Power", "유체": "Fluid", "레이어": "Layer", "L 키로 다음 레이어": "L for the next layer", "보드의 다음 레이어 (재료, 유체, 동력)": "Next board layer (items, fluids, power)", "인벤토리가 가득 차서 선을 거둘 수 없습니다": "The inventory is full, so the line can't come down", "강가": "Riverbank", "노드 찾기": "Find node", "복사": "Copy",
  "Shift+클릭으로 고른 노드를 복사합니다 (Ctrl+C)": "Copies the nodes picked with Shift+click (Ctrl+C)",
  "붙여넣기": "Paste", "복사한 구성을 청사진으로 놓습니다 (Ctrl+V)": "Places the copy as a blueprint (Ctrl+V)",
  "가진 기계로 청사진을 실제로 바꿉니다": "Replaces blueprints with the machines you have",
  "휠로 확대/축소합니다. 누르면 100%로 돌아갑니다": "Wheel zooms. Click to return to 100%",
  "묶기": "Group", "고른 노드를 하나로 묶습니다. 누른 뒤 외부와 연결할 노드를 클릭하세요": "Folds the picked nodes into one. Then click the node that faces outside",
  "묶음의 외부 연결 노드에서 선 연결": "Link from the group's outside node",
  "묶음을 풉니다. 기계와 선은 그대로입니다": "Unfolds the group. Machines and lines stay as they are",
  "묶음 풀기": "Ungroup", "묶음": "Group", "외부:": "Outside:", "노드": "Nodes", "가동": "Running", " · 펼침": " · open",
  "열기": "Open", "이름 바꾸기": "Rename", "설치": "Install", "청사진 지우기": "Delete blueprint", "접기": "Fold", "펼치기": "Unfold",
  "청사진 모두 설치": "Install all blueprints", "선택 풀기": "Clear selection", "비우면 기본 이름": "Blank for default",
  "노드 이름": "Node name", "클릭해서 설치": "Click to install", "기계가 필요합니다": "Needs a machine", "기지 설비": "Base facilities",
  "에서 선 연결": ": start a line", "동력을 나눕니다": "Splits power", "연결": "Linked", "힘": "Force",
  "외부 연결 노드를 클릭": "Click the outside node", "청사진 설치": "Install blueprints",
  // Help
  "전체": "General", "동력 등급 부족": "Power tier too low", "동력 부족": "Not enough power", "연료 없음": "No fuel", "순번": "queue", "열": "heat", "중간제작품": "Parts", "완성품": "Finished goods", "형태 찾기": "Find a shape", "이 도움말": "This help", "지도와 기지 전환, 기지 밖에서는 복귀": "Switch map and base, or return home", "지도에서 걷기 (두 키를 함께 누르면 대각선)": "Walk on the map (two keys together go diagonally)",
  "동굴에서 탐사: 멈춰서 주변 광맥 찾기": "In a cave, prospect: stand still to find veins nearby", "자연 동굴": "Natural cave", "출구": "Way out", "출구로": "To the way out",
  "암반": "Bedrock", "동굴 늑대": "Cave wolf", "예티": "Yeti", "가시 도롱뇽": "Spine salamander", "동굴로 들어가기": "Enter the cave", "나가기": "Climb out", "탐사": "Prospect", "탐사 중": "Prospecting",
  "멈춰서 주변 바위를 두드려 광맥을 찾습니다 (Q)": "Stand still and tap the rock to find veins nearby (Q)",
  "도감 열기": "Open the index", "이동 방식 전환: 위험 피하기, 직진": "Switch walking: avoid danger, straight",
  "창 닫기, 선택 풀기, 닫을 것이 없으면 메뉴": "Close windows, clear selection, or the menu when nothing is open", "아이템 칸": "Item slots", "왼쪽 클릭": "Left click",
  "집기, 놓기, 합치기, 바꾸기": "Pick up, put down, merge, swap", "오른쪽 클릭": "Right click", "절반 집기, 1개 놓기": "Take half, place one",
  "휠": "Wheel", "1개씩 옮기기": "Move one at a time", "Shift+클릭": "Shift+click", "빠르게 옮기기": "Quick move",
  "마우스를 올린 음식 먹기": "Eat the food under the pointer", "마우스를 올린 아이템의 얻는 법, 사용처": "Recipes and uses of the item under the pointer",
  "기계 창이 열려 있을 때 인벤토리에서 1회분 넣기": "With a machine open, load one batch from the bag", "칸이 찰 때까지 넣기": "Load until full",
  "기지 보드": "Base board", "확대, 축소": "Zoom", "바닥 드래그": "Drag ground", "화면 이동": "Move the view", "노드 드래그": "Drag node",
  "노드 옮기기": "Move a node", "우클릭": "Right click", "메뉴 열기: 이름 바꾸기, 복사, 붙여넣기 등": "Menu: rename, copy, paste and more",
  "노드 고르기": "Pick nodes", "Shift+드래그": "Shift+drag", "범위로 고르기": "Box select", "Ctrl+드래그": "Ctrl+drag",
  "청사진으로 복사": "Copy as blueprint", "복사, 붙여넣기": "Copy, paste", "고른 청사진 지우기": "Delete picked blueprints",
  "기계 들고 바닥 클릭": "Click ground holding a machine", "그 자리에 설치": "Install it there", "작업": "Work",
  "작업대에 표시된 키 누르기": "Press the key shown on a bench", "그림 클릭": "Click the picture",
  "판금 망치 작업, 태엽 감기": "Work a plate hammer, wind a spring", "조작": "Controls",
  // Item index
  "종": " kinds", "열량": "Heat", "/개": " each", "구성원": "Members", "연소": "Burns", "초/개": "s each",
  "▱ 표시가 있는 칸 위에서 들어갈 수 있는 아이템 목록": "Over a slot marked ▱, list the items that fit",
  "아이템 도감": "Item index", "이름이나 코드로 검색": "Search by name or code", "아이템 검색": "Search items", " · 키 입력": " · keys", " · 클릭": " · click",
  "인벤토리에 재료가 없습니다": "No materials in your bag", "인벤토리에서 넣기 (Shift: 가득)": "Load from your bag (Shift: fill)",
  "인벤토리에서 재료 넣기": "Load materials from your bag", "건설 재료": "build materials", "이전 아이템": "Previous item", "보유": "Have",
  "얻는 법": "Recipes", "사용처": "Uses", "아직 없습니다": "Nothing yet",
  // Machine window
  "키": "key", "정말 철거?": "Really remove?", "철거": "Remove", "지도에서 강가를 먼저 찾아야 합니다": "Find a riverbank on the map first",
  "다시 누르면 연결을 끊고 관을 돌려받습니다": "Click again to unlink and take the tubes back", "철판 1, 구리관 1이 필요합니다": "Needs 1 iron plate and 1 copper tube",
  "이 강가에서 물을 끌어옵니다": "Draws water from this riverbank", "태엽 감기": "Wind the spring", "창고를 비워야 철거할 수 있습니다": "Empty the warehouse to remove it",
  "들어온 동력을 연결된 곳으로 나눕니다": "Splits incoming power between its lines", "비축": "Reserve", "강가 펌프로 선을 이어야 쓸 수 있습니다": "Link it to a riverbank pump to use it",
  "그림을 클릭해서 감으세요": "Click the picture to wind",
  "강가 미연결": "No riverbank", "동력 없음": "No power", "난이도": "Difficulty", "증기": "Steam", "폐기": "Disposal",
  // Map
  " (고갈됨)": " (empty)", " (수확 불가)": " (out of season)", "지도, 칸을 클릭해 이동": "Map, click a cell to walk",
  "위험 피하기": "Avoid danger", "아는 위험 지역을 돌아갑니다 (T)": "Walks around known danger (T)", "직진": "Straight",
  "위험을 무시하고 곧장 갑니다 (T)": "Walks straight through danger (T)", "본 적 있는 곳에서 찾기": "Search places you've seen", "지도 검색": "Map search",
  "기지": "Base", "산 고도": "Hill, height", "강": "River", "칸": " cells", "보임": "In sight", "기억": "Remembered", "지하": "Underground", "지표": "Surface", "본 적 있는 곳에 없습니다": "Not among places you've seen",
  "북": "N", "남": "S", "서": "W", "동": "E", "캐기": "mine", "광맥": "Vein", "줍기": "Pick", "뜨기": "Fill", "건너기": "Cross", "공격": "Strike", "다가가기": "Close in", "메모": "Note", "이 자리 메모": "Note on this place", "안전 모드: 켜짐": "Safe mode: on", "안전 모드: 꺼짐": "Safe mode: off", "켜면 위험 지역에 들어가기 전에 멈추고 알려 줍니다 (T)": "When on, stops before a hazard and tells you (T)", "안전 모드 켜기, 끄기: 위험 지역 앞에서 멈추고 알려 줌": "Safe mode on or off: stops before a hazard and tells you", "전투": "Fight", "사거리": "Reach", "공격 가능": "Ready", "준비 중": "Readying", "무기": "Weapon", " 칼": " blade", "칼": "Blade", " 창": " spear", "창": "Spear", "공격력 4, 0.7초마다": "Damage 4, every 0.7 s", "공격력 3, 두 칸 거리, 1초마다": "Damage 3, reaches two cells, every 1 s", "서 있는 자리에서 캐기, 줍기, 물 뜨기. 생물이 보이면 공격하고, 멀면 다가가기": "Dig, pick or fill where you stand. With a creature in sight, strike it, or close in when it is out of reach", "평원": "Plains", "숲": "Forest", "산지": "Mountains", "습지": "Marsh", "사막": "Desert", "설원": "Snowfield", "저수지": "Pond", "오아시스": "Oasis", "얼음 구멍": "Ice hole", "얼음": "Ice", "튜토리얼": "Tutorial", "튜토리얼 끄기": "Turn off tutorial", "튜토리얼 다시 보기": "Restart the tutorial", "기지에서 가까운 점토 광맥까지 길을 밝혀 두었습니다. 찾기 칸에 \"점토\"를 검색하고, 광맥을 눌러 걸어간 뒤 F(또는 광맥 그림)를 눌러 점토 12개를 캐세요": "The way from the base to a near clay vein is lit on the map. Search \"clay\" in the search box, click the vein to walk there, then press F (or the vein picture) to dig 12 clay", "왼쪽 찾기 칸에 \"버섯\"이나 \"산딸기\"를 검색하고, 가까운 곳을 눌러 걸어간 뒤 F로 먹을 것 4개를 주우세요. 배가 고프면 가방(I)에서 음식에 마우스를 올리고 E로 먹습니다": "Search \"mushroom\" or \"berry\" in the search box on the left, click a near spot to walk there, and press F to pick 4 food. When hungry, point at food in the bag (I) and press E to eat", "기지로 돌아와 작업대를 열고 노천 가마를 고른 뒤, 박자에 맞춰 Space를 눌러 만드세요": "Back at the base, open the workbench, pick the open kiln, and press Space on the beat to make it", "인벤토리의 노천 가마를 집어 보드 빈 곳을 눌러 설치하세요": "Pick up the open kiln from your inventory and click an empty spot on the board to install it", "석탄과 갈탄은 기지 근처에 없습니다. 지도를 돌아다니며 직접 찾아야 하고, 시간이 좀 걸립니다. 한 번 본 광맥은 찾기 칸에 \"석탄\"이나 \"갈탄\"을 검색하면 나옵니다. 연료 4개를 캐고, 벽돌을 구울 점토도 12개 캐 오세요": "There is no coal or lignite near the base. You have to find it yourself, walking the map, and it takes a while. Once you have seen a vein, search \"coal\" or \"lignite\" to find it again. Dig 4 fuel, and 12 clay for bricks too", "노천 가마에 점토와 연료를 넣어 벽돌 6개를 구우세요": "Put clay and fuel in the open kiln and fire 6 bricks", "작업대에서 괴철로를 만들어 설치하세요 (점토 10, 벽돌 6)": "Make a bloomery at the workbench and install it (10 clay, 6 bricks)", "철광석도 직접 찾아야 합니다. 멀리 돌아다녀야 할 수 있으니 먹을 것을 챙기세요. 한 번 본 광맥은 찾기 칸에 \"철광석\"이나 \"갈철석\"을 검색하면 나옵니다. 철광석 18개를 캐고, 연료도 넉넉히 캐 오세요": "Iron ore has to be found too. You may need to go far, so take food. Once you have seen a vein, search \"iron ore\" or \"limonite\" to find it again. Dig 18 iron ore, and plenty of fuel", "괴철로에 철광석과 연료를 넣고 그림이나 Space로 풀무질해 철 덩이 2개를 만드세요. 게이지를 초록 칸까지 올려야 불이 붙고, 초록 칸에 두어야 작업이 진행되며, 넘치면 재료가 타 버립니다": "Load the bloomery with iron ore and fuel and pump the bellows with the picture or Space to make 2 blooms. The fire lights once the gauge reaches the green, the work moves only while it stays there, and overshooting burns the batch", "벽돌 4개를 더 굽고, 작업대에서 손 단조대를 만들어 설치하세요 (벽돌 4, 철 덩이 2)": "Fire 4 more bricks, then make a hand forge at the workbench and install it (4 bricks, 2 blooms)", "철 덩이를 더 만들어 손 단조대에서 박자에 맞춰 두드려 철 주괴 4개를 만드세요": "Make more blooms and strike them on the beat at the hand forge into 4 iron ingots", "벽돌 8개를 더 굽고, 작업대에서 건설대를 만드세요 (철 4, 벽돌 8). 그러면 S0이 끝납니다": "Fire 8 more bricks and make a construction bench at the workbench (4 iron, 8 bricks). That finishes S0", "빈 철 드럼통에 물 뜨기": "Fill an empty iron drum with water", "기지에서 강가 펌프로 선을 이어 끌어옵니다": "Build a riverbank pump at base and link it here", "에만 수확": " only", "창과 도감": "Windows and the index", "기지 보드의 기계를 클릭하면 그 기계의 창이 열리고, Esc로 닫습니다. 오른쪽 도감은 늘 열려 있어 창 옆에서 같이 씁니다. G를 누르거나 도감 검색 칸에 이름을 치고, 아이템을 누르면 얻는 법과 사용처가 나옵니다. 어느 칸이든 마우스를 올리고 R은 얻는 법, U는 사용처를 엽니다. 기계 창이 열려 있으면 레시피의 +로 재료를 한 번에 넣습니다": "Click a machine on the base board to open its window, and Esc closes it. The index on the right is always open, so use it beside a window. Press G or type a name in its search box, and click an item to see how it is made and what it is for. Over any slot, R opens how it is made and U what it is for. With a machine window open, a recipe's + puts in its ingredients at once", "가방 다루기": "Using the bag", "가방(I)을 열어 보세요. 아이템을 클릭하면 집고, 다른 칸을 클릭하면 놓거나 바꿉니다. 오른쪽 클릭은 절반만 집고, 휠은 하나씩 옮깁니다. Shift+클릭은 가방과 열린 창 사이로 묶음째 옮깁니다. 음식에 마우스를 올리고 E를 누르면 먹고, 집은 것은 버리기로 버립니다. 창고와 기계 칸도 똑같이 다룹니다": "Open the bag (I). Click an item to pick it up, click another slot to put it down or swap. Right-click picks up half, the wheel moves one at a time. Shift+click moves a whole stack between the bag and an open window. Point at food and press E to eat; press Trash to drop what you hold. Stores and machines work the same way", "감지": "ahead", "고도 변화": "climb", "굶주림": "hunger", "안전 모드": "Safe mode", "지도 확대, 축소": "Zoom the map in and out", "기본 조작": "Basics", "식량": "Food", "가마": "Kiln", "연료와 벽돌": "Fuel and bricks", "단조": "Forging", "몸 상태 보기": "Your body", "걸어 보기": "Walk about", "먹을 것 줍기": "Pick food", "점토 캐기": "Dig clay", "노천 가마 만들기": "Make an open kiln", "가마 설치": "Place the kiln", "연료 찾기": "Find fuel", "벽돌 굽기": "Fire bricks", "괴철로 설치": "Place a bloomery", "철광석 찾기": "Find iron ore", "철 덩이 만들기": "Make blooms", "다음": "Next", "위쪽 줄의 체력, 허기, 무게를 보세요. 허기는 시간이 지나며 줄고, 0이 되면 체력이 깎입니다. 허기가 절반 넘게 차 있으면 체력이 천천히 돌아옵니다. 체력이 0이 되면 쓰러져 기지로 돌아오고, 기지에서 멀수록 가진 재료를 더 잃습니다. 무게는 들고 있는 짐입니다. 무거울수록 느리게 걷고, 한도를 넘으면 걷지도 캐지도 못합니다. 짐을 덜려면 가방(I)을 열고 아이템을 클릭해 집은 뒤 버리기를 누르세요": "Look at health, hunger and weight in the top bar. Hunger runs down over time, and at 0 it takes health. With hunger over half full, health slowly comes back. At 0 health you collapse and wake at the base, losing more of what you carry the farther from home you were. Weight is your load: the heavier, the slower you walk, and over the limit you can neither walk nor dig. To lighten it, open the bag (I), click an item to pick it up, and press Trash", "M을 눌러 지도로 나가, WASD로 걷거나 지도의 칸을 눌러 걸어가 보세요. 기지에서 6칸 떨어진 곳까지 가면 됩니다. M을 다시 누르면 기지로 돌아옵니다. 지도 위에서 휠을 굴리면 확대·축소됩니다": "Press M to go out to the map, then walk with WASD or click a cell on the map to walk there. Go 6 cells away from the base. Press M again to come back to the base. Turn the wheel over the map to zoom", "건너뛰기": "Skip", "증기 시대": "Steam Age", "가방": "Bag", "시야": "View", "안전": "Safe", "도감 검색": "Search the index", "가방과 장비 열기, 닫기": "Open or close the bag and gear", "보이는 생물에게 다가가기": "Close in on a creature in sight", "서 있는 자리에서 캐기, 줍기, 물 뜨기. 생물이 보이면 공격만": "Dig, pick or fill where you stand. With a creature in sight, only strike",
  // Routes and saves
  "게임을 시작하지 못했습니다": "The game couldn't start", "세이브를 보관하고 새로 시작": "Set the save aside and start fresh",
  "입력 안 받기": "Refuse input", "초과 폐기": "Discard excess", "가득 차면 더 받지 않습니다. 코크스로가 멈출 수 있습니다": "Takes no more when full. The coke oven may stop", "가득 차면 넘치는 타르를 버립니다": "Throws away tar that doesn't fit when full",
  "발": "Feet", "등": "Back", "손": "Hand", "장비": "Gear", "장비 칸 클릭": "Click a gear slot", "손에 든 장비 입기, 벗기": "Put on or take off gear",
  "이동 속도 +10%": "Walk speed +10%", "최대 무게 +40": "Max load +40", "효과 준비 중": "Effect coming soon",
  " 장화": " boots", "장화": "Boots", " 틀 배낭": " frame pack", "틀 배낭": "Frame pack", " 곡괭이": " pick", "곡괭이": "Pick",
  "증기 모듈": "Steam module", "증기 모듈 장착": "Fit steam module", "증기 모듈 빼기": "Remove steam module", "빼면 증기 동력 선이 끊어집니다": "Removing it cuts steam lines", "장착해야 증기 동력을 받을 수 있습니다": "Needed to take steam power", "증기 모듈이 있어야 증기 동력을 받습니다": "Needs a steam module to take steam power",
  "고갈 숨기기": "Hide empty", "연결 설정": "Route", "보내는 쪽에 동력이 없어 멈춰 있습니다": "Stopped: the sending side has no power", "포트": "Ports", "연결 비용:": "Line cost:", "이동 중": "Moving", "대기": "Idle",
  "슬롯": "Slot", "비어 있음": "Empty", "저장 실패": "Save failed", "불러오기": "Load",
  // Slots
  " (E: 먹기)": " (E: eat)", " (용기로만 옮길 수 있음)": " (needs a container)", "개": "", "칸, 비어 있음": " slot, empty", "빈 칸": "Empty slot",
  // Game data: lines and items
  "전부 순서대로": "All in turn", "주 산출물": "Main output", "산딸기": "Berries", "버섯": "Mushroom", "구운 산딸기": "Baked berries", "구운 버섯": "Baked mushroom",
  "물 드럼통": "Water drum", "강가 연결": "Riverbank link", "철광석": "Iron ore", "석탄": "Coal", "점토": "Clay", "구리광": "Copper ore", "물": "Water", "석회석": "Limestone",
  "벽돌": "Brick", "철 주괴": "Iron ingot", "구리 주괴": "Copper ingot", "슬래그": "Slag", "황가루": "Sulfur powder", "보일러": "Boiler", "증기기관": "Steam engine", "코크스": "Coke", "콜타르": "Coal tar",
  "강철": "Steel", "고철": "Scrap", "강판": "Steel plate", "강철 축": "Steel shaft", "기어": "Gear", "구리선": "Copper wire", "포트 증설 플랜지": "Port flange", "절연 피치": "Insulating pitch",
  "절연 코일": "Insulated coil", "철심": "Iron core", "증기 발전기": "Steam generator",
  // Game data: machines
  "창고": "Warehouse", "벽돌 가마": "Brick kiln", "판금 망치": "Plate hammer", "성형대": "Forming bench", "보일러 제작대": "Boiler bench", "기관 조립대": "Engine bench",
  "관 하나가 나르는 최대 유량": "Most one pipe carries", "성능": "Stats", "새 선을 이것으로 놓습니다. 성능은 도감에서 볼 수 있습니다": "Lays new lines with this. Its stats are in the index", "벨트 하나가 나르는 최대 양": "Most one belt carries",
  "손작업 최대": "Fastest by hand", "소리 켜짐": "Sound on", "소리 꺼짐": "Sound off", "물 1L가 끓어 되는 증기": "Steam from 1 L of boiling water", "약 6기압": "about 6 bar", "선철": "Pig iron", "증기 드럼": "Steam drum",
  "글자": "Words", "모양": "Shapes", "노드 모양": "Node look", "노드에 이름과 재료를 글자로 보입니다": "Shows each node's name and materials in words", "노드에 설비 그림을 보입니다": "Shows each node's machine picture",
  "키 입력": "Keys", "박자": "Rhythm", "클릭": "Click", "음식": "Food", "풀무질": "Pump", "두드리기": "Strike", "입력": "Type", "풀무": "Bellows", "정확": "Exact", "좋음": "Good", "빗나감": "Miss", "연속": "Streak", "과열! 재료가 타 버렸습니다": "Overheated! The batch burnt",
  "까지 관": " needs", "개를 놓습니다": " tubes laid", "인벤토리에": "In the bag:", "취소": "Cancel",
  "압송 펌프": "Pressure pump", "배관": "Pipes", "압송": "Pressure", "L/초": " L/s", "관당": "Per pipe", "연결된 관 없음": "No pipes connected",
  "받은 동력으로 연결된 유체망의 관을 모두 같은 속도로 밀어 보냅니다": "Pushes every pipe of the joined fluid network at one pace, on the power it gets",
  "이 유체망에 돌아가는 압송 펌프가 없어 멈춰 있습니다": "Stopped: no running pressure pump on this fluid network",
  "철 덩이": "Iron bloom", "작업대": "Workbench", "노천 가마": "Open kiln", "괴철로": "Bloomery", "손 단조대": "Hand forge", "손작업": "Hand work",
  "태엽 동력기": "Spring motor", "증기 배분기": "Steam manifold", "벨트 구동기": "Belt drive", "건설대": "Construction bench", "기계 찾기": "Find a machine", "청사진을 놓습니다. 기계는 작업대나 건설대에서 만듭니다": "Places a blueprint. Machines are made on a workbench or construction bench", "완성된 기계는 아이템으로 인벤토리에 들어갑니다. 손에 들고 보드를 클릭하면 설치됩니다": "A finished machine goes in the inventory as an item. Hold it and click the board to install it", "공급": "Supplies", "구동기": "Drives", "대": "", "줄": "", "벨트당": "per belt", "최대": "max", "이 기계로 만드는 것을 도감에서 봅니다": "See what this machine makes in the codex", "내 인벤토리": "My inventory", "안": "contents", "구동": "Drive", "벨트": "Belts", "개/초": "/s", "연결된 벨트 없음": "No belts joined", "받은 동력으로 연결된 물류망의 벨트를 모두 같은 속도로 돌립니다": "Runs every belt of its network at one pace on the power it gets", "이 물류망에 돌아가는 벨트 구동기가 없어 멈춰 있습니다": "No belt drive is running this network, so it stands", "관 (철관, 구리관)": "Tube (iron or copper)", "재료 분배기": "Item splitter", "강가 펌프": "Riverbank pump", "증기 해머": "Steam hammer", "코크스로": "Coke oven", "고로": "Blast furnace",
  "전로": "Converter", "산화 구리광": "Copper oxide ore", "황화 구리광": "Copper sulfide ore", "구리 매트": "Copper matte", "타르 저장조": "Tar tank", "압연기": "Rolling mill", "증기 선반": "Steam lathe", "기어 절삭기": "Gear cutter", "증기 인발기": "Wire drawer", "타르 증류기": "Tar still",
  "코일 권선기": "Coil winder", "철심 프레스": "Core press", "발전기 조립대": "Generator bench",
  // Game data: stages, layers and grades
  "증기기관 + 구리 배관": "Steam engine + copper piping", "증기 동력 보급": "Steam power", "코크스와 고로": "Coke and blast furnaces", "증기 공작기계": "Steam machine tools",
  "지표 산화대": "Oxidized surface", "얕은 지하": "Shallow ground", "심부": "Deep ground", "빈약": "Scarce", "보통": "Normal", "풍부": "Rich",
  // Game data: ores
  "갈철석": "Limonite", "황철석": "Pyrite", "자철석": "Magnetite", "공작석": "Malachite", "휘동석": "Chalcocite", "황동석": "Chalcopyrite", "갈탄": "Lignite", "역청탄": "Bituminous coal",
  "무연탄": "Anthracite", "고령토": "Kaolin", "도보": "On foot", "개량 이동": "Better walking", "철로": "Rail", "자동 운송": "Auto haul",
  // Game data: metals and forms. A part's name is its metal plus its form.
  "철": "Iron", "구리": "Copper", "판": " plate", "관": " tube", " 실린더": " cylinder", "실린더": "Cylinder", " 드럼통": " drum", "드럼통": "Drum", " 막대": " rod", "막대": "Rod", " 리벳": " rivet", "리벳": "Rivet", " 기어": " gear", " 스프링": " spring", "스프링": "Spring", " 팬": " fan", "팬": "Fan", " 운반 벨트": " conveyor belt", "운반 벨트": "Conveyor belt", "운송": "Transport",
};
