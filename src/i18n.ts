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
  "지금까지 만든 단계가 열린 상태로, 감긴 태엽 동력기, 벨트 구동기, 제련로, 원료 창고, 부품 창고, 모든 기계 2대씩, 인벤토리의 선 재료와 함께 시작합니다": "Starts with every stage so far open, a wound spring motor, a belt drive, a smelter, warehouses of raw materials and parts, two of every machine, and line materials in the inventory",
  "메뉴": "Menu", "메뉴 (Esc)": "Menu (Esc)",
  "정말 초기화?": "Really reset?", "조작 도움말 (단축키 ?)": "Controls (shortcut ?)", "조작 도움말": "Controls",
  "단축키 G": "Shortcut G", "단축키 M": "Shortcut M", "인벤토리": "Inventory", "정렬": "Sort", "버리기": "Trash",
  "들고 있는 아이템을 버립니다": "Throws away the held item", "계속하기": "Continue", "지도": "Map", "기지로": "To base",
  "기지로 복귀": "Return to base", "목표": "Goal", "년차": " yr", "쇠약": "Weak", "초": "s", "체력": "HP", "허기": "Food",
  "무게": "Load", "초과, 이동 불가": "over, can't walk", " 초과, 이동 불가": " over, can't walk",
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
  "암반": "Bedrock", "동굴 늑대": "Cave wolf", "가시 도롱뇽": "Spine salamander", "동굴로 들어가기": "Enter the cave", "나가기": "Climb out", "탐사": "Prospect", "탐사 중": "Prospecting",
  "멈춰서 주변 바위를 두드려 광맥을 찾습니다 (P)": "Stand still and tap the rock to find veins nearby (P)",
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
  "그림을 클릭해서 감으세요": "Click the picture to wind", "키를 누르세요": "Press the keys", "그림을 클릭하세요": "Click the picture",
  "강가 미연결": "No riverbank", "동력 없음": "No power", "난이도": "Difficulty", "증기": "Steam", "폐기": "Disposal",
  // Map
  " (고갈됨)": " (empty)", " (수확 불가)": " (out of season)", "지도, 칸을 클릭해 이동": "Map, click a cell to walk",
  "위험 피하기": "Avoid danger", "아는 위험 지역을 돌아갑니다 (T)": "Walks around known danger (T)", "직진": "Straight",
  "위험을 무시하고 곧장 갑니다 (T)": "Walks straight through danger (T)", "본 적 있는 곳에서 찾기": "Search places you've seen", "지도 검색": "Map search",
  "기지": "Base", "산 고도": "Hill, height", "강": "River", "칸": " cells", "보임": "In sight", "기억": "Remembered", "본 적 있는 곳에 없습니다": "Not among places you've seen",
  "북": "N", "남": "S", "서": "W", "동": "E", "캐기": "mine", "기지에서 강가 펌프로 선을 이어 끌어옵니다": "Build a riverbank pump at base and link it here", "에만 수확": " only",
  // Routes and saves
  "게임을 시작하지 못했습니다": "The game couldn't start", "세이브를 보관하고 새로 시작": "Set the save aside and start fresh",
  "입력 안 받기": "Refuse input", "초과 폐기": "Discard excess", "가득 차면 더 받지 않습니다. 코크스로가 멈출 수 있습니다": "Takes no more when full. The coke oven may stop", "가득 차면 넘치는 타르를 버립니다": "Throws away tar that doesn't fit when full",
  "발": "Feet", "등": "Back", "손": "Hand", "장비": "Gear", "장비 칸 클릭": "Click a gear slot", "손에 든 장비 입기, 벗기": "Put on or take off gear",
  "걷는 시간 35% 감소": "35% less time per step", "최대 무게 +40": "Max load +40", "광맥을 한 번에 2개 캠": "Mines 2 at a time",
  " 장화": " boots", "장화": "Boots", " 틀 배낭": " frame pack", "틀 배낭": "Frame pack", " 곡괭이": " pick", "곡괭이": "Pick",
  "증기 모듈": "Steam module", "증기 모듈 장착": "Fit steam module", "증기 모듈 빼기": "Remove steam module", "빼면 증기 동력 선이 끊어집니다": "Removing it cuts steam lines", "장착해야 증기 동력을 받을 수 있습니다": "Needed to take steam power", "증기 모듈이 있어야 증기 동력을 받습니다": "Needs a steam module to take steam power",
  "고갈 숨기기": "Hide empty", "연결 설정": "Route", "보내는 쪽에 동력이 없어 멈춰 있습니다": "Stopped: the sending side has no power", "포트": "Ports", "연결 비용:": "Line cost:", "이동 중": "Moving", "대기": "Idle",
  "슬롯": "Slot", "비어 있음": "Empty", "저장 실패": "Save failed", "불러오기": "Load",
  // Slots
  " (E: 먹기)": " (E: eat)", " (용기로만 옮길 수 있음)": " (needs a container)", "개": "", "칸, 비어 있음": " slot, empty", "빈 칸": "Empty slot",
  // Game data: lines and items
  "전부 순서대로": "All in turn", "주 산출물": "Main output", "산딸기": "Berries", "버섯": "Mushroom", "구운 산딸기": "Baked berries", "구운 버섯": "Baked mushroom",
  "물 드럼통": "Water drum", "강가 연결": "Riverbank link", "철광석": "Iron ore", "석탄": "Coal", "점토": "Clay", "구리광": "Copper ore", "물": "Water", "석회석": "Limestone",
  "벽돌": "Brick", "철 주괴": "Iron ingot", "구리 주괴": "Copper ingot", "슬래그": "Slag", "보일러": "Boiler", "증기기관": "Steam engine", "코크스": "Coke", "콜타르": "Coal tar",
  "강철": "Steel", "고철": "Scrap", "강판": "Steel plate", "강철 축": "Steel shaft", "기어": "Gear", "구리선": "Copper wire", "포트 증설 플랜지": "Port flange", "절연 피치": "Insulating pitch",
  "절연 코일": "Insulated coil", "철심": "Iron core", "증기 발전기": "Steam generator",
  // Game data: machines
  "창고": "Warehouse", "벽돌 가마": "Brick kiln", "제련로": "Smelter", "판금 망치": "Plate hammer", "성형대": "Forming bench", "보일러 제작대": "Boiler bench", "기관 조립대": "Engine bench",
  "관 하나가 나르는 최대 유량": "Most one pipe carries", "성능": "Stats", "새 선을 이것으로 놓습니다. 성능은 도감에서 볼 수 있습니다": "Lays new lines with this. Its stats are in the index", "벨트 하나가 나르는 최대 양": "Most one belt carries",
  "글자": "Words", "모양": "Shapes", "노드 모양": "Node look", "노드에 이름과 재료를 글자로 보입니다": "Shows each node's name and materials in words", "노드에 설비 그림을 보입니다": "Shows each node's machine picture",
  "키 입력": "Keys", "박자": "Rhythm", "클릭": "Click", "음식": "Food", "박자에 맞춰 그림이나 Space": "Strike on the beat: picture or Space", "풀무질: 초록 칸 유지": "Pump: keep it in the green", "풀무": "Bellows", "정확": "Exact", "좋음": "Good", "빗나감": "Miss", "연속": "Streak", "과열! 재료가 타 버렸습니다": "Overheated! The batch burnt",
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
  "갈철석": "Limonite", "적철석": "Hematite", "자철석": "Magnetite", "공작석": "Malachite", "휘동석": "Chalcocite", "황동석": "Chalcopyrite", "갈탄": "Lignite", "역청탄": "Bituminous coal",
  "무연탄": "Anthracite", "고령토": "Kaolin", "도보": "On foot", "개량 이동": "Better walking", "철로": "Rail", "자동 운송": "Auto haul",
  // Game data: metals and forms. A part's name is its metal plus its form.
  "철": "Iron", "구리": "Copper", "판": " plate", "관": " tube", " 실린더": " cylinder", "실린더": "Cylinder", " 드럼통": " drum", "드럼통": "Drum", " 막대": " rod", "막대": "Rod", " 리벳": " rivet", "리벳": "Rivet", " 기어": " gear", " 스프링": " spring", "스프링": "Spring", " 팬": " fan", "팬": "Fan", " 운반 벨트": " conveyor belt", "운반 벨트": "Conveyor belt", "운송": "Transport",
};
