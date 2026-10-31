import type { Database } from "bun:sqlite";

// 서버 → 브라우저 메시지. 브라우저 → 서버는 입력 한 줄(평문)이다.
export type Out =
  | { t: "out"; d: string }
  | { t: "prompt"; d: string; secret?: boolean }
  | { t: "bye" };

export type Size = { cols: number; rows: number };

type Post = { no: number; author: string; title: string; body: string; created_at: number; views: number; likes: number };
type Memo = { id: number; sender: string; body: string; created_at: number; read_at: number | null };
type Item = { no: string; go: string; name: string };
type ClubBoard = { no: string; name: string; key?: string };
// castle: 환타지동호회처럼 첫 화면이 성 그림이다. chat: 동호회 안 대화방.
// grid: 아트미디어처럼 게시판 번호를 두 줄씩 늘어놓은 첫 화면. data: 자료실 목록(data.code로 연다). leave: 탈퇴 번호.
type Club = {
  go: string;
  name: string;
  desc: string[];
  boards?: ClubBoard[];
  castle?: boolean;
  chat?: { no: string; name: string };
  // grid.banner: 둘째 칸 아래 가운데 줄. motto: 알림이 없을 때 아래에 띄우는 글. bare: 글 수를 안 보이는 게시판(true면 전부). "" 칸은 비운다.
  // rows: 칸마다 줄 목록, 한 줄은 번호 두세 개. labels: 칸 위 가로줄에 넣는 이름(왼쪽·오른쪽).
  grid?: { title: string; banner?: string; motto?: string; rows: string[][][]; labels?: Record<number, string[]>; bare?: string[] | true };
  data?: { code: string; name: string; rooms: string[] };
  info?: { no: string; name: string };
  leave?: { no: string; name: string };
};
type Small = { go: string; title: string; clubs: Club[] };
type Section = { title: string; items: { no: string; name: string }[] };
// denied: 글을 못 쓸 때 알림(없으면 동호회 가입 안내)
type Board = { key: string; code: string; title: string; back: () => void; canWrite: () => boolean; denied?: string };

const MAX_LINE = 500;
const MAX_BODY_LINES = 200; // 피씨월드 1991.9의 게시글 길이 제한
const MAX_MEMO = 200;
const CHAT_WARN_MS = 25 * 60_000;
const MAX_ROOMS = 14; // 분류 하나에 열 수 있는 채팅방 수(한 화면에 들어가는 만큼)
const TOPIC_CELLS = 40;
const ID_RE = /^[a-z][a-z0-9]{2,7}$/;
const SERVICE = "hitel";
// 내용은 하이텔처럼 80칸 폭이다. 화면이 더 넓으면 가운데 둔다. 마지막 줄은 브라우저의 상태 줄.
const WIDTH = 80;
const LIST_PAGE = 13;
const LIKES = "(SELECT count(*) FROM post_likes l WHERE l.no = posts.no) AS likes";
const BODY_PAGE = 16;
const CLS = "\x1b[2J\x1b[H";
const HL = "\x1b[1;33m";
const RS = "\x1b[0m";
const HR = " " + "-".repeat(76);
// pptx 5번 슬라이드의 하이텔 화면 색: 초록·보라 머리 막대, 보라 상자, 검은 그림자
const GREEN = "\x1b[0;1;37;42m";
const PURPLE = "\x1b[0;1;37;45m";
const CYAN = "\x1b[0;30;46m";
const PANEL = "\x1b[0;1;37;45m";
const SHADOW = "\x1b[0;40m";

// 하이텔 초기화면의 세 칸. 번호는 그 화면을 따른다.
const COMM: Item[] = [
  { no: "11", go: "plaza", name: "네티즌광장" },
  { no: "12", go: "memo", name: "메일센터" },
  { no: "13", go: "chat", name: "대화실" },
  { no: "14", go: "data", name: "자료실" },
  { no: "15", go: "club", name: "동호회/모임" },
  { no: "16", go: "game", name: "게임/바둑" },
  { no: "17", go: "internet", name: "인터넷" },
];
const CONTENTS: Item[] = [
  { no: "21", go: "news", name: "뉴스/매거진" },
  { no: "22", go: "life", name: "생활/가정" },
  { no: "23", go: "ent", name: "방송/연예" },
  { no: "24", go: "culture", name: "문화/레저" },
  { no: "25", go: "stock", name: "증권/금융" },
  { no: "26", go: "biz", name: "기업네트워크" },
  { no: "27", go: "bank", name: "홈뱅킹" },
];
const SPECIAL: Item[] = [
  { no: "1", go: "guide", name: "HiTEL길라잡이" },
  { no: "2", go: "newbie", name: "초보자마당" },
  { no: "3", go: "find", name: "정보 찾기" },
  { no: "4", go: "event", name: "생생 이벤트" },
  { no: "5", go: "class", name: "사이버 교실" },
];
// 첫 화면에는 없지만 go로 가는 곳(no를 go와 같게 둬서 번호로는 안 걸린다)
const HIDDEN: Item[] = [
  { no: "small", go: "small", name: "소모임" },
  { no: "quiz", go: "quiz", name: "퀴즈방" },
  { no: "liter", go: "liter", name: "하이텔문학관" },
];
const MENU = [...COMM, ...CONTENTS, ...SPECIAL, ...HIDDEN];
// 첫 화면 명령 줄의 짧은 이름
const ALIAS: Record<string, string> = { mm: "memo", say: "chat" };

// 하이텔에 있던 동호회 이름을 빌렸다. 소개 글은 이 재현을 위해 새로 쓴 것이다.
const CLUBS: Club[] = [
  { go: "ksc", name: "과학동호회", desc: ["과학을 좋아하는 사람들의 모임입니다.", "하이텔 과학동호회(go ksc)를 본떴습니다."] },
  { go: "jubu", name: "주부동호회", desc: ["살림 이야기, 아이 키우는 이야기, 오늘 저녁 반찬 이야기를 나눕니다.", "살림하는 분이라면 누구나 반깁니다."] },
  { go: "osc", name: "OS동호회", desc: ["도스, 윈도우, OS/2, 유닉스까지 운영체제를 이야기합니다.", "설치하다 막히면 질문과답에 올려 주세요."] },
  { go: "vtgl", name: "VT 자료실", desc: ["VT 접속에 쓰는 통신 프로그램과 설정 이야기를 나눕니다.", "에뮬레이터, 글꼴, 색 설정 무엇이든 좋습니다."] },
  { go: "kgavt", name: "개오동", desc: ["하이텔의 이름난 동호회였던 개오동이 VT 화면으로 다시 모였습니다.", "옛 회원도 새 회원도 반갑습니다."] },
  { go: "cgame", name: "고게회", desc: ["고전게임동호회입니다.", "오락실과 PC의 옛 게임을 추억하고 공략을 나눕니다."] },
  { go: "soft", name: "소프트웨어 동호회", desc: ["쓸 만한 프로그램을 찾고, 써 보고, 평을 남깁니다."] },
  { go: "prg", name: "프로그래밍전문 동호회", desc: ["C, 파스칼, 어셈블리로 프로그램을 짜는 사람들의 모임입니다.", "소스와 강좌를 나눕니다."] },
  { go: "hanpro", name: "한글프로그래밍 동호회", desc: ["한글 입출력, 조합형과 완성형, 한글 글꼴을 다루는 프로그래밍 모임입니다."] },
  { go: "semtle", name: "셈틀가락", desc: ["컴퓨터 음악 동호회입니다. 셈틀은 컴퓨터, 가락은 음악을 뜻하는 우리말입니다.", "미디, 시퀀서, 사운드카드 이야기를 나눕니다."] },
  { go: "ani", name: "애니메이트", desc: ["애니메이션을 좋아하는 사람들의 모임입니다.", "감상평, 그림, 새 작품 소식을 나눕니다."] },
  { go: "metal", name: "METAL 동호회", desc: ["헤비메탈을 듣고 이야기하는 사람들의 모임입니다.", "음반 평과 공연 소식을 나눕니다."] },
  { go: "music", name: "음악동호회", desc: ["듣고, 연주하고, 이야기합니다."] },
  { go: "movie", name: "영화동호회", desc: ["지난주에 본 영화 이야기를 나눕니다."] },
];

const small = (go: string, name: string, desc?: string[]): Club => ({
  go,
  name,
  desc: desc ?? [`'${name}'에 오신 것을 환영합니다.`, "같은 것을 좋아하는 사람끼리 모인 소모임입니다. 이야기방에 인사를 남겨 주세요."],
});

// 소모임은 주제(분류)별로 모이고 go 이름은 sg 번호다. 오락/게임 목록은 하이텔 FFUN 화면을 옮겼다.
// sg1343(스매싱펌킨스 모임) 말고는 번호를 차례로 붙였다.
// 퀴즈방 문제: [문제, 보기 넷, 정답 번호(1부터)]. 한 판에 다섯 문제를 섞어 낸다.
const QUIZ: [string, string[], number][] = [
  ["하이텔의 전국 공통 접속 번호는?", ["114", "01410", "119", "131"], 2],
  ["서태지와 아이들의 데뷔곡은?", ["하여가", "컴백홈", "난 알아요", "교실 이데아"], 3],
  ["통신 프로그램 '이야기'를 만든 회사는?", ["한글과컴퓨터", "삼보컴퓨터", "큰사람", "데이콤"], 3],
  ["1988년 서울 올림픽 마스코트는?", ["꿈돌이", "호돌이", "수호랑", "반다비"], 2],
  ["1993년 대전 엑스포 마스코트는?", ["꿈돌이", "호돌이", "곰돌이", "하나리"], 1],
  ["천리안을 서비스한 회사는?", ["한국통신", "나우콤", "삼성SDS", "데이콤"], 4],
  ["하이텔을 서비스한 회사는?", ["한국통신", "데이콤", "나우콤", "현대전자"], 1],
  ["90년대 무선호출기를 흔히 부르던 말은?", ["시티폰", "삐삐", "카폰", "워크맨"], 2],
  ["한컴타자연습에서 떨어지는 낱말을 쳐서 막는 게임은?", ["베네치아", "테트리스", "산성비", "갤러그"], 3],
  ["PC통신에서 '방가방가'는 무슨 뜻?", ["반가워요", "안녕히", "고마워요", "미안해요"], 1],
  ["1995년 드라마 '모래시계'를 방송한 곳은?", ["KBS", "MBC", "EBS", "SBS"], 4],
  ["1997년 외환위기 때 한국이 구제금융을 받은 국제기구는?", ["UN", "IMF", "WTO", "OECD"], 2],
  ["도스에서 파일 목록을 보는 명령은?", ["LS", "CAT", "DIR", "LIST"], 3],
  ["'스타크래프트'가 나온 해는?", ["1994", "1996", "1998", "2000"], 3],
];
const QUIZ_ROUND = 5;

// 하이텔문학관(go liter). 게시판 키는 liter:<key>. 연재 글은 seed가 넣고, 이용자는 감상란에만 쓴다.
const LITER: { no: string; key: string; name: string; open?: boolean }[] = [
  { no: "1", key: "notice", name: "알림" },
  { no: "2", key: "novel", name: "장편 연재란" },
  { no: "3", key: "short", name: "중단편란" },
  { no: "4", key: "talk", name: "독자 감상란", open: true },
];

const SMALLS: Small[] = [
  {
    go: "ffun",
    title: "오락/게임",
    clubs: [
      CLUBS.find((c) => c.go === "cgame")!,
      small("sg1101", "트레이딩 카드게임"),
      small("sg1102", "그라비티 사랑 소모임 '네오리스'"),
      small("sg1103", "컨오브하트를 즐기는 사람들 모임"),
      small("sg1104", "로봇대전 소모임 '론드-벨'"),
      small("sg1105", "미소녀게임연구소"),
      small("sg1106", "Leaf Lovers' Life"),
      small("sg1107", "드림캐스트를 사랑하는 사람들의 모임"),
      small("sg1108", "The Forum of elf 'Sweet on You'"),
      small("sg1109", "스타워즈 소모임 '제다이'"),
      small("sg1110", "삼국지 클럽"),
      small("sg1111", "창세기전 게임클럽"),
      small("sg1112", "FINAL FANTASY '유구한 바람의 환타지'"),
      small("sg1113", "피아 캐롯 사랑모임"),
      small("sg1114", "펌프(pumpitup) 매니아"),
      small("sg1115", "구원의 반 사랑 모임"),
      small("sg1116", "은하영웅전설 클럽"),
    ],
  },
  {
    go: "falt",
    title: "얼터너티브 음악",
    clubs: [small("sg1343", "스매싱펌킨스 모임", ["The Smashing Pumpkins를 좋아하는 사람들의 소모임입니다.", "음반 이야기, 가사 번역, 공연 소식을 나눕니다."])],
  },
  {
    go: "flit",
    title: "문학/독서",
    clubs: [
      small("sg1201", "이다", ["글을 올리고 생각을 나누며 토론하는 문학 모임입니다.", "시, 소설, 비평 무엇이든 좋습니다."]),
      small("sg1202", "리터란 독서", ["읽은 책의 서평과 독서 일기를 올리는 곳입니다."]),
      small("sg1203", "연재소설방", ["소설을 한 회씩 연재하는 곳입니다.", "등단하지 않아도 누구나 연재할 수 있습니다."]),
    ],
  },
];

// 하이텔 자료실 [분류] 화면. 번호마다 게시판 하나다(파일 대신 글로 자료를 소개한다).
const DATA: { row: number; col: number; color: string; section: Section }[] = [
  { row: 4, col: 2, color: GREEN, section: { title: "게      임", items: [
    { no: "1", name: "액션/아케이드/스포츠" }, { no: "2", name: "시뮬/롤플/어드벤처" }, { no: "3", name: "퍼즐/카드/기타 게임" },
    { no: "4", name: "에뮬/음악 게임" }, { no: "5", name: "동영상/사운드/이미지" }, { no: "6", name: "패치/맵/세이브/기타" },
  ] } },
  { row: 4, col: 28, color: PURPLE, section: { title: "유틸리티/컴퓨터", items: [
    { no: "11", name: "유틸리티" }, { no: "12", name: "인터넷/통신" }, { no: "13", name: "멀티미디어" }, { no: "14", name: "하드웨어/드라이버" },
    { no: "15", name: "OS관련" }, { no: "16", name: "프로그래밍" }, { no: "17", name: "기타 유틸리티" },
  ] } },
  { row: 4, col: 54, color: CYAN, section: { title: "데   이   터", items: [
    { no: "21", name: "음악/사운드" }, { no: "22", name: "동영상 데이터" }, { no: "23", name: "그래픽 데이터" }, { no: "24", name: "문서 데이터" },
  ] } },
  { row: 14, col: 2, color: CYAN, section: { title: "테마 자료실", items: [
    { no: "31", name: "홈페이지 자료실" }, { no: "32", name: "프리웨어 자료실" }, { no: "33", name: "이벤트 자료실" },
    { no: "81", name: "S/W 광장" }, { no: "82", name: "전문 자료" },
  ] } },
  { row: 14, col: 28, color: PURPLE, section: { title: "자료실 게시판", items: [
    { no: "41", name: "자료실 Q & A" }, { no: "42", name: "자료 추천" }, { no: "43", name: "중복/불량자료신고" },
    { no: "44", name: "자료 요청" }, { no: "45", name: "강좌/메뉴얼" }, { no: "46", name: "자유 게시판" },
  ] } },
  { row: 14, col: 54, color: GREEN, section: { title: "추천/새 자료", items: [
    { no: "51", name: "오늘의 추천자료" }, { no: "52", name: "운영자 추천자료" }, { no: "53", name: "새로 등록된자료" }, { no: "54", name: "하이텔 관련자료" },
  ] } },
];

// 하이텔 대화실 [분류] 화면. 위 셋, 아래 셋.
const CHAT_GUIDE = "99";
const CHAT_MEMO = "53";
const CHATS: Section[] = [
  { title: "번개팅이 좋아", items: [
    { no: "1", name: "느낌있는 대화" }, { no: "2", name: "자유로운 대화" }, { no: "3", name: "초보자 대화실" }, { no: "4", name: "타자 방" }, { no: "5", name: "함께 만드는 대화실" },
  ] },
  { title: "지역별 대화실", items: [
    { no: "21", name: "서울특별시" }, { no: "22", name: "인천/경기/강원" }, { no: "23", name: "대전/충청" },
    { no: "24", name: "광주/전라" }, { no: "25", name: "대구/울산/경상" }, { no: "26", name: "부산/제주" },
  ] },
  { title: "우리끼리 좋아", items: [
    { no: "41", name: "초등학생 끼리끼리" }, { no: "42", name: "중학생 모여라" }, { no: "43", name: "고등학생 대화실" },
    { no: "44", name: "대학생 대화실" }, { no: "45", name: "직장인의 휴식처" }, { no: "46", name: "게임좋아하는 사람" },
  ] },
  { title: "특화 대화실", items: [
    { no: "11", name: "여성 대화실" }, { no: "12", name: "주부 대화실" }, { no: "13", name: "연령별 대화실" },
    { no: "14", name: "영어 대화실" }, { no: "15", name: "장애인 대화실" }, { no: "16", name: "KETEL 대화실" },
  ] },
  { title: "MULTI - CHAT", items: [{ no: "31", name: "인터넷 대화실" }, { no: "32", name: "스타 채팅" }, { no: "77", name: "미팅/펜팔" }] },
  { title: "메모 / 안내", items: [{ no: CHAT_MEMO, name: "대화실 메모란" }, { no: CHAT_GUIDE, name: "대화실 이용안내" }] },
];
const ROOMS = CHATS.slice(0, 5).flatMap((c) => c.items);

const CLUB_BOARDS: ClubBoard[] = [
  { no: "1", key: "talk", name: "이야기방" },
  { no: "2", key: "qna", name: "질문과답" },
];

// 하이텔 환타지동호회(FNTSY) 첫 화면의 번호들. 4는 대화방, 98은 가입.
const FNTSY_JOIN = "98";
const FNTSY_TOWERS: { turret: string; items: string[] }[] = [
  { turret: "44.과학소설", items: ["26.작가와 독자와의", "   대화 (문학잡담)", "25.왕국평론회(비평/감상)", "24.음유시인의 노래터", "   (장편)", "23.단편란", "27.중편란"] },
  { turret: "88.인터넷", items: ["98.회원메뉴", "", "2.공지사항", "3.로완에게", "6.여론의 광장", "  (건의/의견)", "9.투표/설문"] },
  { turret: "55.RPG동호회", items: ["16.환상 연구소(토론관)", "15.문서보관소", "14.현자의 학원", "   (질문/답변)", "13.FAQ 게시판", "", ""] },
];
const FNTSY_WALL = [
  "18.서적정보  19.넓은 세상 소식(인터넷)  20.강의/강좌  21.영상/게임",
  "",
  "4.환상 주점 (대화방)           11.모험가들과의 만남 (잡담란)",
  "5.왕립 도서관 (자료실)   7.소모임 게시판   8.소모임 게시판 2",
];
const FNTSY: Club = {
  go: "fntsy",
  name: "환타지동호회",
  desc: ["판타지 소설을 쓰고 읽는 사람들의 동호회입니다."],
  castle: true,
  chat: { no: "4", name: "환상 주점" },
  boards: [
    ["44", "과학소설"], ["88", "인터넷"], ["55", "RPG동호회"], ["26", "작가와 독자와의 대화"], ["25", "왕국평론회"],
    ["24", "음유시인의 노래터"], ["23", "단편란"], ["27", "중편란"], ["2", "공지사항"], ["3", "로완에게"], ["6", "여론의 광장"],
    ["9", "투표/설문"], ["16", "환상 연구소"], ["15", "문서보관소"], ["14", "현자의 학원"], ["13", "FAQ 게시판"], ["18", "서적정보"],
    ["19", "넓은 세상 소식"], ["20", "강의/강좌"], ["21", "영상/게임"], ["11", "모험가들과의 만남"], ["5", "왕립 도서관"],
    ["7", "소모임 게시판"], ["8", "소모임 게시판 2"],
  ].map(([no, name]) => ({ no, name })),
};
CLUBS.push(FNTSY);

// 천리안 아트미디어 동호회(go am). 1994년 책에 실린 첫 화면과 보물창고 목록을 옮겼다.
const ARTMEDIA: Club = {
  go: "am",
  name: "아트미디어",
  desc: ["멀티미디어와 광고, 윈도우즈를 다루는 동호회입니다. 천리안의 A/V 동호회에서 시작해 멀티미디어 동호회를 거쳐 아트미디어가 됐습니다."],
  chat: { no: "c", name: "여기모여 대화를" },
  info: { no: "am", name: "아미동 회원정보" },
  leave: { no: "99", name: "아미동이여 안녕~" },
  grid: {
    title: "A r t   M e d i a  -  The Special Interest Group",
    banner: "멋진 Windows 와 Multi-Media 의 세계로의 입성을 환영합니다",
    rows: [
      [["a1", "w1"], ["a2", "w2"], ["a3", "w3"]],
      [["m1", "i"], ["m2", "q"]],
      [["1", "s"], ["2", "b"], ["c", "b1"]],
      [["am", "99"]],
    ],
    bare: ["w2", "w3"],
  },
  data: {
    code: "b",
    name: "아미동 보물창고",
    rooms: [
      "Windows & NT Utility", "Windows & NT Sound/Graphic Application", "Windows & NT Game & Driver & ETC...",
      "OS/2 Applications & Driver 자료실...", "DOS Utility & Game & Macintosh", "DOS Sound/Graphic Application",
      "소그룹 전용 자료실", "Sample (Sound,Pic,Icon,Font Data,...)", "Documents & Texts", "Private Room (개인화일 교환의 장)",
      "DOS Multimedia Application & Demo",
    ],
  },
  boards: [
    ["a1", "광고 게시판"], ["a2", "광고 아카데미"], ["a3", "광고 소모임"], ["w1", "윈도우즈 활용강좌 & Tip"],
    ["w2", "윈도우즈 프로그래밍 소모임"], ["w3", "윈도우즈 애플리케이션 소모임"], ["m1", "멀티미디어 강좌"],
    ["m2", "하드웨어활용 및 응용"], ["i", "정보/소식을 나누어요~"], ["q", "무엇이든 물어보세요~"], ["1", "아트 십자로"],
    ["2", "새로 왔어요!"], ["s", "아트 알림판"], ["b1", "보물창고 Q & A"],
  ].map(([no, name]) => ({ no, name })),
};
CLUBS.push(ARTMEDIA);

// 하이텔 대중매체 모니터링 동호회(go djmon, 대모동). 사회/종교. 1994년 4월호 잡지에 실린 첫 화면을 옮겼다.
const DJMON: Club = {
  go: "djmon",
  name: "대중매체모니터링",
  desc: ["신문, 방송, 광고, 잡지, PC통신까지 대중매체를 회원들이 스스로 살펴보고 의견을 나누는 동호회입니다."],
  chat: { no: "4", name: "사랑을 나눠요" },
  info: { no: "1", name: "가입신청/회원 정보" },
  grid: {
    title: "대 중 매 체 모 니 터 링   (DJMON)",
    motto: "대모동은 늘 최선을 다하고 있습니다..........",
    bare: true,
    rows: [
      [["1", "9"], ["2", "10"], ["3", "11"], ["4", "12"], ["5", "13"], ["6", ""]],
      [["14", "15"], ["16", "17"], ["18", "19"], ["8", ""]],
      [["21", "7"], ["", "939"]],
    ],
  },
  boards: [
    ["2", "공지사항(알립니다)"], ["3", "운영진께 바랍니다"], ["5", "자료를 나눠요(공개자료실)"], ["6", "자료실 게시판"],
    ["9", "신문 모니터링"], ["10", "방송 모니터링"], ["11", "광고 모니터링"], ["12", "잡지, 영화, 기타"],
    ["13", "PC통신 모니터링"], ["14", "토론을 합시다"], ["15", "통신일기"], ["16", "물어보세요/알려드려요"],
    ["17", "대모동 이렇게 해봐요"], ["18", "대모동 시사칼럼"], ["19", "정보 제공"], ["8", "연구발표장"],
    ["21", "전대기련게시판"], ["7", "자유게시판"], ["939", "마음에 담는글"],
  ].map(([no, name]) => ({ no, name })),
};
CLUBS.push(DJMON);

// 천리안 TV-매니아 동호회(go tv). 문화, 시삽 이성진(zstv), 1992년부터. 1994년 잡지에 실린 첫 화면을 옮겼다.
const TVMANIA: Club = {
  go: "tv",
  name: "TV-매니아",
  desc: ["TV를 아끼는 모든 사람이 함께하는 동호회입니다. 드라마, 오락, 뉴스, 광고까지 TV 이야기를 나눕니다."],
  chat: { no: "17", name: "오손도손 대화실" },
  info: { no: "2", name: "회원은 누구누굴까??" },
  leave: { no: "99", name: "TV동과의 작별" },
  grid: {
    title: "티/비/매/니/아  .T.E.L.E.V.I.S.I.O.N.  .M.A.N.I.A.   [GO TV]",
    labels: { 0: ["[Since 1992]"], 1: ["[TITLE'S MENU]", "[PDS/소그룹 MENU]"], 3: ["[TV 정보 MENU]"] },
    bare: ["1", "14", "vm", "vg", "18", "19", "98"],
    rows: [
      [["1", "2"]],
      [["11", "p1"], ["13", "p2"], ["14", ""], ["15", "vm"], ["16", "vg"]],
      [["17", "18", "19"]],
      [["20", "qa"], ["21", "24"], ["22", "25"], ["23", "26"]],
      [["98", "99"]],
    ],
  },
  boards: [
    ["1", "시삽님이 알려드립니다."], ["11", "첨뵙겠습니다~"], ["13", "우리들만의 낙서장"], ["14", "우체통"],
    ["15", "그림마을 ANSI/TEXT"], ["16", "벼룩시장"], ["p1", "나눔터"], ["p2", "자료실 게시판"],
    ["vm", "비디오 매니아(Video Mania)"], ["vg", "비디오 매니아 -가입신청-"], ["18", "설문 조사실"], ["19", "토론실"],
    ["20", "드라마/연속극"], ["21", "오락/영화(만화)"], ["22", "뉴스/시사"], ["23", "광고"], ["qa", "TV 관련(Q/A)"],
    ["24", "AFKN/기타"], ["25", "오늘의 볼거리"], ["26", "스타탐방"], ["98", "시삽님께 편지써요"],
  ].map(([no, name]) => ({ no, name })),
};
CLUBS.push(TVMANIA);

// 하이텔 멀티미디어 클럽(go mmc). 음악/영상, 시삽 강성욱(k2mmc, roadster), 1994년 1월에 생겼다.
// 7 자유 게시판은 만물시장·펑키와 함께·회칙토론실로 나뉘어 있어 자료실 목록 화면으로 연다.
const MMC: Club = {
  go: "mmc",
  name: "멀티미디어 클럽",
  desc: ["멀티미디어 정보를 나누고 자료를 모아 회원끼리 실력을 키우는 모임입니다. 초보자를 위한 강좌란도 있습니다."],
  chat: { no: "4", name: "대화실" },
  info: { no: "1", name: "가입 신청" },
  data: { code: "7", name: "자유 게시판", rooms: ["만물시장", "펑키와 함께", "회칙토론실(신설)"] },
  grid: {
    title: "하이텔 멀티미디어 클럽(MMC)",
    labels: { 1: ["[ H I T E L ]"], 2: ["[MULTI-MEDIA]"], 3: ["[ C L U B ]"] },
    bare: true,
    rows: [
      [["1", "2", "3"]],
      [["4", "7", "20"], ["9", "", ""]],
      [["8", "10"], ["11", "12"], ["13", "14"], ["15", "16"], ["17", ""]],
      [["5", "6"], ["18", "19"]],
    ],
  },
  boards: [
    ["2", "공지 사항"], ["3", "시삽 수신 편지"], ["9", "클럽 광장"], ["20", "원로원"], ["8", "정보센터"],
    ["10", "멀티미디어 / CD-ROM TITLES"], ["11", "멀티미디어 / 영상 & 그래픽스"], ["12", "멀티미디어 / 음악 & 음향"],
    ["13", "멀티미디어 / 저장장치"], ["14", "멀티미디어 / 커뮤니케이션"], ["15", "멀티미디어 / 프리젠테이션 소그룹"],
    ["16", "멀티미디어 / 운영체제"], ["17", "멀티미디어 / WINDOWS APPLICATION"], ["5", "공개 자료실"], ["6", "자료실 게시판"],
    ["18", "초보자를 위한 [메기학당]"], ["19", "강좌"],
  ].map(([no, name]) => ({ no, name })),
};
CLUBS.push(MMC);

// 케텔 접속 화면처럼 글자 자체로 그린 로고. 윗줄일수록 오른쪽으로 밀어 기울인다.
const GLYPHS: Record<string, string[]> = {
  H: ["H   H", "H   H", "HHHHH", "H   H", "H   H"],
  I: ["III", " I ", " I ", " I ", "III"],
  T: ["TTTTT", "  T  ", "  T  ", "  T  ", "  T  "],
  E: ["EEEEE", "E    ", "EEEE ", "E    ", "EEEEE"],
  L: ["L    ", "L    ", "L    ", "L    ", "LLLLL"],
};

export const LOGO = [0, 1, 2, 3, 4]
  .map((row) => " ".repeat(12 + 4 - row) + [..."HITEL"].map((ch) => GLYPHS[ch][row]).join("   ").trimEnd())
  .join("\n");

// 로그인하면 보이는 공지 목록. 하이텔 공지 화면처럼 오른쪽에 날짜를 둔다.
const NOTICES: { title: string; date: string; body: string[] }[] = [
  { title: "하이텔 한시 운영 안내", date: "10/29", body: ["이 서비스는 정해진 기간 동안만 열립니다.", "운영이 끝나면 '접속 끊기' 후 읽기 전용 아카이브로 남습니다."] },
  { title: "개인정보를 입력하지 마십시오", date: "10/29", body: ["실명, 주민등록번호, 연락처는 받지 않습니다.", "ID와 비밀번호만으로 가입합니다."] },
  { title: "'님' 문화와 1인 1 ID", date: "10/29", body: ["호칭은 형·누나가 아니라 '님'입니다.", "한 사람이 한 ID를 쓰는 것이 예의입니다."] },
  { title: "플라자 '큰마을' 개장..GO PLAZA", date: "10/29", body: ["누구나 글을 쓰는 큰마을이 열렸습니다.", "글을 읽고 V를 누르면 추천할 수 있습니다."] },
  { title: "동호회 회원 모집 - 셈틀가락, 고게회, 개오동 외..GO CLUB", date: "10/29", body: ["동호회 첫 화면에서 J를 누르면 가입합니다.", "동호회 게시판에는 회원만 글을 씁니다."] },
  { title: "소모임 [오락/게임] 17곳 개설..GO FFUN", date: "10/29", body: ["소모임은 주제별로 모여 있습니다. go small 에서 분류를 고르세요."] },
  { title: "자료광장 분류 안내..GO DATA", date: "10/29", body: ["게임, 유틸리티, 데이터, 테마 자료실로 나뉩니다.", "파일 대신 글로 자료를 소개합니다."] },
  { title: "대화실 개편 - 지역별/우리끼리 대화실..GO CHAT", date: "10/29", body: ["대화실이 여러 방으로 나뉘었습니다.", "참가자는 /W, 나가기는 /Q 입니다."] },
  { title: "글쓰기 안내 - 200행까지, /s 로 저장", date: "10/29", body: ["글은 200행까지 쓸 수 있습니다.", "/s 저장, /a 취소."] },
  { title: "하이텔문학관 개관 - PC통신 연재 소설..GO LITER", date: "10/31", body: ["PC통신에 연재되던 소설을 모아 읽는 곳입니다.", "감상은 독자 감상란에 남겨 주세요."] },
];

const online = new Set<Session>();
type ChatRoom = { id: number; topic: string; owner: string };
type Category = { no: string; name: string };
const roomKey = (id: number) => `u:${id}`;
const rooms = new Map<string, Set<Session>>(); // 대화방 번호 → 참가자

// 터미널에서 차지하는 칸 수. 한글·한자·전각 문자는 2칸. 색 바꾸는 코드는 0칸.
export function cells(s: string) {
  let n = 0;
  for (const ch of s.replace(/\x1b\[[0-9;]*m/g, "")) {
    const c = ch.codePointAt(0)!;
    const wide =
      (c >= 0x1100 && c <= 0x115f) ||
      (c >= 0x2e80 && c <= 0xa4cf) ||
      (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6);
    n += wide ? 2 : 1;
  }
  return n;
}

// w칸에 맞춰 자르거나 채운다. 자를 때는 색 코드가 없는 글자만 넘긴다(제목, ID 등).
function pad(s: string, w: number) {
  if (cells(s) <= w) return s + " ".repeat(w - cells(s));
  let out = "";
  for (const ch of s) {
    if (cells(out + ch) > w) break;
    out += ch;
  }
  return out + " ".repeat(w - cells(out));
}

function center(s: string, w: number) {
  const left = Math.max(0, Math.floor((w - cells(s)) / 2));
  return pad(" ".repeat(left) + s, w);
}

// 띄어쓰기에서 줄을 바꾼다. 한 낱말이 w칸보다 길 때만 낱말 가운데서 자른다.
function wrap(s: string, w: number) {
  const lines = [""];
  for (const word of s.split(/(?<= )/)) {
    if (cells(lines[lines.length - 1] + word.trimEnd()) > w && lines[lines.length - 1]) lines.push("");
    for (const ch of word) {
      if (cells(lines[lines.length - 1] + ch) > w) lines.push("");
      lines[lines.length - 1] += ch;
    }
  }
  return lines.map((l) => l.trimEnd());
}

// 제어 문자를 지운다. 남겨 두면 남이 쓴 글이 다른 사람 화면에 ANSI 코드로 끼어든다.
export function clean(line: string) {
  return line.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").slice(0, MAX_LINE);
}

function kst(ms: number) {
  return new Date(ms).toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }); // "2026-10-29 19:44:00"
}

// "26년 10월 29일(목) 21시 43분 28초"
function longKst(ms: number) {
  const d = new Date(ms + 9 * 3600_000);
  const day = "일월화수목금토"[d.getUTCDay()];
  return `${String(d.getUTCFullYear()).slice(2)}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일(${day}) ${d.getUTCHours()}시 ${d.getUTCMinutes()}분 ${d.getUTCSeconds()}초`;
}

const mmdd = (ms: number) => kst(ms).slice(5, 10).replace("-", "/");

function hms(sec: number) {
  return [sec / 3600, (sec / 60) % 60, sec % 60].map((n) => String(Math.floor(n)).padStart(2, "0")).join(":");
}

const raw = (row: number, col: number) => `\x1b[${row};${col}H`;

export class Session {
  user = "";
  private since = Date.now();
  private page = 0;
  private board!: Board;
  private memoIds: number[] = [];
  private handler: (line: string) => unknown = () => {};
  private queue: Promise<unknown> = Promise.resolve();
  private chatTimer?: ReturnType<typeof setTimeout>;
  private room?: { no: string; name: string };
  private lastSeen: number | null = null;
  private chatBack = () => this.chatList();
  private up: () => void = () => this.clubList(); // 동호회 첫 화면에서 P로 돌아갈 목록
  private cols: number;
  private margin: string; // 80칸 내용을 가운데 두는 왼쪽 여백
  private top: number; // 24줄 본문을 세로 가운데 두는 위쪽 여백(머리 두 줄은 늘 맨 위)

  constructor(
    private db: Database,
    private send: (m: Out) => void,
    private hangup: () => void,
    size: Size = { cols: WIDTH, rows: 25 },
  ) {
    this.cols = size.cols;
    this.margin = " ".repeat(Math.floor((size.cols - WIDTH) / 2));
    this.top = Math.floor((size.rows - 25) / 2);
  }

  // 하이텔 텔넷 첫 화면을 따랐다(파란 광고 상자는 뺐다)
  start() {
    const INV = "\x1b[0;30;47m";
    this.print(
      [
        "",
        `\x1b[1;37m${LOGO}${RS}`,
        "",
        `${INV}[통  신]${RS} 01410 으로 접속하셨습니다. 모뎀속도 14400bps (지역 : 전국사용가능)`,
        "",
        `${INV}## 이용자ID가 없거나 신규/무료가입을 하시려면 '${SERVICE}'을 입력하십시오.${RS}`,
        `\x1b[1;36m<> 오늘의 추천정보 : 옛 오락실 게임을 추억하는 고게회!! go cgame${RS}`,
        "",
      ].join("\n"),
    );
    this.askId();
  }

  // 비밀번호 해시가 비동기라 입력은 한 줄씩 차례로 처리한다.
  input(raw: string) {
    const line = clean(raw);
    this.queue = this.queue
      .then(() => this.handler(line))
      .catch((err) => {
        console.error(err);
        this.user ? this.main(" 오류가 발생했습니다.") : this.askId();
      });
    return this.queue;
  }

  end() {
    this.handler = () => {};
    if (this.user) this.db.query("UPDATE users SET last_seen = ? WHERE id = ?").run(Date.now(), this.user);
    this.leaveChat();
    online.delete(this);
  }

  print(d: string) {
    this.send({ t: "out", d: d.split("\n").map((l) => (l ? this.margin + l : l)).join("\n") + "\n" });
  }

  // ---- 화면 그리기 ----

  // 80칸 내용 안의 위치
  private at(row: number, col: number) {
    return raw(row + this.top, this.margin.length + col);
  }

  private lines(row: number, col: number, lines: string[]) {
    return lines.map((l, i) => this.at(row + i, col) + l).join("");
  }

  // 하이텔 머리 줄: 맨 윗줄은 hitel 꼬리표와 가로줄, 둘째 줄은 메뉴 코드·제목·오른쪽 글. 화면 끝까지 그린다.
  private header(code: string, title: string, right = `${this.user}님`) {
    const w = this.cols;
    const second = pad(` ${code}`, Math.floor(w / 2) - Math.ceil(cells(title) / 2)) + title;
    return (
      raw(1, 1) +
      "\x1b[0;30;47m hitel \x1b[0;1;34m" +
      "▄".repeat(w - 7) +
      raw(2, 1) +
      "\x1b[0;1;37m" +
      pad(second, w - cells(right) - 1) +
      right +
      " " +
      RS
    );
  }

  // 칸 머리 막대: 위에 파란 얇은 줄, 아래에 검은 얇은 줄(그림자)
  private head(row: number, col: number, width: number, label: string, color: string) {
    return (
      this.at(row - 1, col) + "\x1b[0;34m" + "▄".repeat(width) +
      this.at(row, col) + color + center(label, width) +
      this.at(row + 1, col) + "\x1b[0;30m" + "▀".repeat(width) + RS
    );
  }

  // 보라 상자와 오른쪽·아래 그림자. 다음에 쓸 줄 번호를 돌려준다.
  private box(row: number, col: number, width: number, lines: string[]): [string, number] {
    let out = "";
    lines.forEach((l, i) => {
      out += this.at(row + i, col) + PANEL + " " + pad(l, width - 2) + " " + RS;
      if (i > 0) out += SHADOW + "  " + RS;
    });
    out += this.at(row + lines.length, col + 2) + SHADOW + " ".repeat(width) + RS;
    return [out, row + lines.length + 2];
  }

  // 화면 전체를 다시 그리고 커서를 promptRow 줄 맨 앞에 둔다
  private draw(d: string, promptRow: number) {
    this.send({ t: "out", d: CLS + d + raw(promptRow + this.top, 1) });
  }

  private ask(prompt: string, handler: (line: string) => unknown, secret = false) {
    this.handler = handler;
    this.send({ t: "prompt", d: this.margin + prompt, secret });
  }

  // ---- 접속과 로그인 (케텔·하이텔 접속 화면을 따른다) ----

  private askId(tries = 0) {
    this.ask("이용자ID : ", (line) => {
      const id = line.trim().toLowerCase();
      if (!id) return this.askId(tries);
      if (id === SERVICE) return this.newId();
      const row = this.db.query("SELECT pw FROM users WHERE id = ?").get(id) as { pw: string } | null;
      if (row) return this.askPw(id, row.pw, tries);
      this.print(`  등록되지 않은 ID입니다. 가입하시려면 '${SERVICE}'을 입력하십시오.`);
      this.askId(tries);
    });
  }

  private newId() {
    this.ask("  사용할 ID(영문으로 시작하는 3~8자) : ", (line) => {
      const id = line.trim().toLowerCase();
      if (!ID_RE.test(id) || id === SERVICE) {
        this.print("  ID는 영문으로 시작하는 3~8자의 영문·숫자입니다.");
        return this.newId();
      }
      if (this.db.query("SELECT 1 FROM users WHERE id = ?").get(id)) {
        this.print(`  '${id}'는 이미 있는 ID입니다.`);
        return this.newId();
      }
      this.signup(id);
    });
  }

  private askPw(id: string, hash: string, tries: number) {
    this.ask(
      "비밀 번호 : ",
      async (pw) => {
        if (await Bun.password.verify(pw, hash)) return this.welcome(id);
        if (tries >= 2) {
          this.print("  비밀번호가 세 번 틀렸습니다.");
          return this.bye();
        }
        this.print("  비밀번호가 틀렸습니다.");
        this.askId(tries + 1);
      },
      true,
    );
  }

  private signup(id: string) {
    this.ask(
      "  사용할 비밀번호(4자 이상) : ",
      (pw) => {
        if (pw.length < 4) {
          this.print("  4자 이상 입력하세요.");
          return this.signup(id);
        }
        this.ask(
          "  한 번 더 입력하세요 : ",
          async (pw2) => {
            if (pw2 !== pw) {
              this.print("  두 비밀번호가 다릅니다.");
              return this.signup(id);
            }
            const hash = await Bun.password.hash(pw);
            this.askName(id, hash);
          },
          true,
        );
      },
      true,
    );
  }

  // 큰마을 목록의 이름 칸에 쓴다. 실명을 묻지 않으므로 별명이면 된다.
  private askName(id: string, hash: string) {
    this.ask("  이름(별명, 한글 4자까지. 엔터는 ID) : ", (line) => {
      const name = pad(line.replace(/[\x00-\x1f\x7f]/g, "").trim(), 8).trim() || id;
      // 확인과 가입 사이에 누가 같은 ID를 가져갔을 수 있다
      const r = this.db
        .query("INSERT OR IGNORE INTO users (id, pw, created_at, name) VALUES (?, ?, ?, ?)")
        .run(id, hash, Date.now(), name);
      if (r.changes === 0) {
        this.print("  방금 다른 분이 이 ID로 가입했습니다.");
        return this.askId();
      }
      this.welcome(id, `${name}님, 가입을 환영합니다.`);
    });
  }

  private welcome(id: string, greet = `${id}님 반갑습니다.`) {
    const row = this.db.query("SELECT last_seen FROM users WHERE id = ?").get(id) as { last_seen: number | null };
    this.user = id;
    this.since = Date.now();
    this.lastSeen = row.last_seen;
    online.add(this);
    this.noticeList(` ${HL}${greet}${RS}`);
  }

  // 로그인 직후 공지 목록. 번호는 공지, 엔터는 초기화면, 메뉴 번호와 GO도 통한다.
  private noticeList(notice = "") {
    const unread = this.unread();
    this.draw(
      [
        this.at(2, 1) + ` 최근 Logout 시각 : ${this.lastSeen ? longKst(this.lastSeen) : "처음 오셨습니다"}`,
        this.at(3, 1) + ` 지금 ${online.size}명이 접속해 있습니다.` + (unread ? `  ${HL}새 쪽지 ${unread}통${RS} (R)` : ""),
        this.at(5, 1) + center("<<<     공  지  사  항     >>>", WIDTH),
        this.lines(6, 1, NOTICES.map((n, i) => `${String(i + 1).padStart(3)}. ${pad(n.title, 66)}${n.date}`)),
        this.at(21, 1) + notice,
        this.at(22, 1) + " 번호/명령(H.도움말 R.쪽지읽기 ENTER.초기화면 GO.직접이동)",
      ].join(""),
      23,
    );
    this.ask(">> ", (line) => {
      const c = line.trim().toLowerCase();
      if (!c) return this.main();
      if (c === "h") return this.noticeList(" 번호는 공지 읽기, 엔터는 초기화면, R은 쪽지함, 'go 이름'은 바로 이동입니다.");
      if (c === "r") return this.memoList();
      const n = /^\d+$/.test(c) ? NOTICES[Number(c) - 1] : undefined;
      if (n) return this.noticeRead(n);
      const item = MENU.find((m) => m.no === c || m.go === c);
      if (item) return this.open(item);
      if (this.nav(c)) return;
      this.noticeList(" 잘못된 명령입니다. (H.도움말)");
    });
  }

  private noticeRead(n: (typeof NOTICES)[number]) {
    this.draw(
      [
        this.header("NOTICE", "공지사항"),
        this.at(4, 1) + ` ${HL}${n.title}${RS}`,
        this.at(5, 1) + HR,
        this.lines(6, 1, n.body.flatMap((l) => wrap(l, 74)).map((l) => " " + l)),
      ].join(""),
      22,
    );
    this.ask(" 목록(엔터) >> ", (line) => {
      const c = line.trim().toLowerCase();
      if (c && this.nav(c)) return;
      this.noticeList();
    });
  }

  private bye() {
    const sec = Math.floor((Date.now() - this.since) / 1000);
    this.print(`\n  이용해 주셔서 감사합니다. 사용 시간 ${hms(sec)}`);
    this.send({ t: "bye" });
    this.end();
    this.hangup();
  }

  // ---- 메뉴 ----

  // t, x, go 이름은 어느 메뉴에서나 통한다
  private nav(cmd: string) {
    const c = cmd.trim().toLowerCase();
    if (c === "t" || c === "top") return this.main(), true;
    if (c === "x" || c === "bye") return this.bye(), true;
    if (!c.startsWith("go ")) return false;
    const name = c.slice(3).trim() === "board" ? "plaza" : c.slice(3).trim(); // 예전 이름 go board도 받는다
    const item = MENU.find((m) => m.go === name || m.no === name);
    if (item) return this.open(item), true;
    const cat = SMALLS.find((g) => g.go === name);
    if (cat) return this.smallList(cat), true;
    return this.openClub(name);
  }

  private openClub(go: string) {
    const club = CLUBS.find((cl) => cl.go === go);
    if (club) return (this.up = () => this.clubList()), this.clubHome(club), true;
    const cat = SMALLS.find((g) => g.clubs.some((cl) => cl.go === go));
    if (!cat) return false;
    this.up = () => this.smallList(cat);
    this.clubHome(cat.clubs.find((cl) => cl.go === go)!);
    return true;
  }

  private open(item: Item) {
    if (item.go === "plaza") {
      this.board = { key: "free", code: "PLAZA", title: "큰마을", back: () => this.main(), canWrite: () => true };
      return this.boardList(0);
    }
    if (item.go === "chat") return this.chatList();
    if (item.go === "club") return this.clubList();
    if (item.go === "small") return this.smallCats();
    if (item.go === "game") return this.gameMenu();
    if (item.go === "quiz") return this.quiz();
    if (item.go === "liter") return this.liter();
    if (item.go === "data") return this.dataList();
    if (item.go === "memo") return this.memoList();
    this.main(` [${item.name}] 준비 중인 메뉴입니다.`);
  }

  private main(notice = "") {
    const items = (list: Item[]) => list.map((m) => `${m.no}. ${m.name}`);
    const [special] = this.box(4, 55, 24, ["", "", ...items(SPECIAL).map((l) => " " + l), "", ""]);
    this.draw(
      [
        this.header("TOP", "하이텔"),
        this.head(5, 3, 22, "Communication", GREEN),
        this.head(5, 29, 22, "Contents", PURPLE),
        special,
        this.at(4, 55) + PANEL + center(`${HL}* Hi-Special *${PANEL}`, 24) + RS,
        this.lines(8, 4, items(COMM)),
        this.lines(8, 30, items(CONTENTS)),
        this.at(16, 1) + notice,
        this.at(18, 1) + " 이동(GO,인덱스) 통화(CALL) 대화(SAY) 쪽지(MM) 메세지(ME) 프로필(PF) 명령어(CMD)",
      ].join(""),
      19,
    );
    this.ask(" 기타(ETC) 도움말(H) >> ", (line) => {
      const c = ALIAS[line.trim().toLowerCase()] ?? line.trim().toLowerCase();
      if (!c || c === "p") return this.main();
      const item = MENU.find((m) => m.no === c || m.go === c);
      if (item) return this.open(item);
      if (this.nav(c)) return;
      this.main(" 없는 메뉴입니다.");
    });
  }

  // ---- 게시판 (자유게시판과 동호회 게시판이 같이 쓴다) ----

  private boardList(page = this.page, notice = "") {
    const b = this.board;
    const total = (this.db.query("SELECT count(*) AS n FROM posts WHERE board = ?").get(b.key) as { n: number }).n;
    const pages = Math.max(1, Math.ceil(total / LIST_PAGE));
    this.page = Math.min(Math.max(page, 0), pages - 1);
    const posts = this.db
      .query(
        `SELECT no, author, title, created_at, views, ${LIKES}, (SELECT coalesce(name, id) FROM users u WHERE u.id = posts.author) AS name FROM posts WHERE board = ? ORDER BY no DESC LIMIT ? OFFSET ?`,
      )
      .all(b.key, LIST_PAGE, this.page * LIST_PAGE) as (Post & { name: string | null })[];
    // 하이텔 플라자처럼 번호·이름·날짜·조회·추천·제목 순서. 큰마을은 이름 옆에 ID도 둔다(옛 자료 글은 ID가 없고, 이름 없이 가입한 사람은 ID를 이름으로 쓴다).
    const plaza = b.key === "free";
    const num = (n: number) => String(n).padStart(4);
    const who = (p: Post & { name: string | null }) =>
      plaza ? pad(p.name ?? p.author, 9) + pad(p.name ? p.author : "", 10) : pad(p.author, 9);
    const tw = plaza ? 32 : 42;
    const rows = posts.map((p) => ` ${num(p.no)}  ${who(p)}${pad(mmdd(p.created_at), 7)}${num(p.views)} ${num(p.likes)}  ${pad(p.title, tw)}`);
    this.draw(
      [
        this.header(b.code, b.title, `${this.page + 1}/${pages}쪽`),
        this.head(4, 2, 76, pad(`번호  ${pad("이름", 9)}${plaza ? pad("ID", 10) : ""}${pad("날짜", 7)}조회 추천  제목`, 76), CYAN),
        this.lines(6, 1, rows.length ? rows : ["  아직 글이 없습니다. w로 첫 글을 써 보세요."]),
        this.at(20, 1) + notice,
        this.at(21, 1) + " 읽기(번호) 쓰기(W) 다음(N) 앞(B) 이전(P) 처음(T) 종료(X)",
      ].join(""),
      22,
    );
    this.ask(" >> ", (line) => {
      const c = line.trim().toLowerCase();
      if (!c) return this.boardList();
      if (/^\d+$/.test(c)) return this.readPost(Number(c));
      if (c === "w") return b.canWrite() ? this.writeTitle() : this.boardList(this.page, b.denied ?? " 동호회에 가입해야 글을 쓸 수 있습니다. (동호회 첫 화면에서 j)");
      if (c === "n") return this.boardList(this.page + 1, this.page + 1 < pages ? "" : " 마지막 쪽입니다.");
      if (c === "b") return this.boardList(this.page - 1, this.page > 0 ? "" : " 첫 쪽입니다.");
      if (c === "p") return b.back();
      if (this.nav(c)) return;
      this.boardList(this.page, " 잘못된 명령입니다.");
    });
  }

  private readPost(no: number, from = 0, notice = "") {
    if (from === 0 && !notice) this.db.query("UPDATE posts SET views = views + 1 WHERE no = ? AND board = ?").run(no, this.board.key);
    const p = this.db.query(`SELECT *, ${LIKES} FROM posts WHERE no = ? AND board = ?`).get(no, this.board.key) as Post | null;
    if (!p) return this.boardList(this.page, " 그런 번호의 글은 없습니다.");
    const lines = p.body.split("\n");
    const more = from + BODY_PAGE < lines.length;
    this.draw(
      [
        this.header(this.board.code, this.board.title),
        this.at(4, 1) + ` ${HL}${p.no}. ${p.title}${RS}`,
        this.at(5, 1) + ` 글쓴이 ${p.author}   ${kst(p.created_at).slice(0, 16)}   조회 ${p.views}  추천 ${p.likes}`,
        this.at(6, 1) + HR,
        this.lines(7, 1, lines.slice(from, from + BODY_PAGE).map((l) => " " + l)),
        this.at(23, 1) + (notice || HR),
      ].join(""),
      24,
    );
    this.ask(more ? " 계속(엔터) 추천(V) 목록(Q) >> " : " 추천(V) 목록(엔터) >> ", (line) => {
      const c = line.trim().toLowerCase();
      if (c === "v") {
        if (p.author === this.user) return this.readPost(no, from, " 자기 글은 추천할 수 없습니다.");
        const { changes } = this.db.query("INSERT OR IGNORE INTO post_likes (no, user) VALUES (?, ?)").run(no, this.user);
        return this.readPost(no, from, changes ? ` ${HL}추천했습니다.${RS}` : " 이미 추천한 글입니다.");
      }
      if (more && !c) return this.readPost(no, from + BODY_PAGE);
      if (/^\d+$/.test(c)) return this.readPost(Number(c));
      if (c && c !== "q" && this.nav(c)) return;
      this.boardList();
    });
  }

  private writeTitle() {
    this.draw(this.header(this.board.code, `글쓰기 ${this.board.title}`) + this.at(4, 1) + "  제목을 비워 두면 취소됩니다.", 6);
    this.ask(" 제목 : ", (line) => {
      const title = line.trim().slice(0, 40);
      if (!title) return this.boardList(this.page, " 글쓰기를 취소했습니다.");
      this.print(`  본문을 입력하세요.  /s 저장   /a 취소   (최대 ${MAX_BODY_LINES}행)`);
      this.writeBody(title, []);
    });
  }

  private writeBody(title: string, lines: string[]) {
    const full = lines.length >= MAX_BODY_LINES;
    this.ask(full ? " 행이 꽉 찼습니다. /s 또는 /a > " : `${String(lines.length + 1).padStart(3)}: `, (line) => {
      const c = line.trim().toLowerCase();
      if (c === "/a") return this.boardList(this.page, " 글쓰기를 취소했습니다.");
      if (c === "/s") {
        if (!lines.length) {
          this.print("  본문이 비어 있습니다.");
          return this.writeBody(title, lines);
        }
        this.db
          .query("INSERT INTO posts (board, author, title, body, created_at) VALUES (?, ?, ?, ?, ?)")
          .run(this.board.key, this.user, title, lines.join("\n"), Date.now());
        return this.boardList(0, " 저장했습니다.");
      }
      if (!full) lines.push(line.trimEnd());
      this.writeBody(title, lines);
    });
  }

  // ---- 동호회 ----

  private members(club: Club) {
    return (this.db.query("SELECT count(*) AS n FROM club_members WHERE club = ?").get(club.go) as { n: number }).n;
  }

  private isMember(club: Club) {
    return !!this.db.query("SELECT 1 FROM club_members WHERE club = ? AND user = ?").get(club.go, this.user);
  }

  private clubList(notice = "") {
    // 두 줄로 늘어놓는다. 가입한 곳은 앞에 *.
    const cell = (c: Club) => `${this.isMember(c) ? "*" : " "}go ${pad(c.go, 7)}${pad(c.name, 21)}${String(this.members(c)).padStart(3)}명`;
    const half = Math.ceil(CLUBS.length / 2);
    const rows = CLUBS.slice(0, half).map((c, i) => cell(c) + (CLUBS[half + i] ? cell(CLUBS[half + i]) : ""));
    // 소모임은 동호회 밑에 있다. 목록 끝 빈칸(없으면 새 줄)에 눈에 띄게 둔다.
    const small = `${HL}>go small  ${pad("소모임 (주제별, S)", 21)}${String(SMALLS.reduce((n, g) => n + g.clubs.length, 0)).padStart(3)}곳${PANEL}`;
    if (CLUBS.length % 2) rows[rows.length - 1] += small;
    else rows.push(" ".repeat(cells(cell(CLUBS[0]))) + small);
    const [list, next] = this.box(6, 2, 76, ["", ...rows, ""]);
    this.draw(
      [
        this.header("CLUB", "동호회/모임"),
        this.head(4, 2, 76, "동 호 회   목 록", GREEN),
        list,
        this.at(next + 1, 1) + notice,
        this.at(next + 3, 1) + " 들어가기(이름, 예: ksc) 소모임(S) 이전(P) 처음(T) 종료(X)",
      ].join(""),
      next + 4,
    );
    this.ask(" >> ", (line) => {
      const c = line.trim().toLowerCase();
      if (!c) return this.clubList();
      if (c === "p") return this.main();
      if (c === "s") return this.smallCats(); // 소모임은 첫 화면에 없고 동호회/모임 밑에 있다
      const go = c.replace(/^go /, "");
      if (CLUBS.some((cl) => cl.go === go)) return this.openClub(go);
      if (this.nav(c)) return;
      this.clubList(" 그런 동호회는 없습니다.");
    });
  }

  private clubHome(club: Club, notice = "") {
    const member = this.isMember(club);
    const boards = club.boards ?? CLUB_BOARDS;
    const [screen, promptRow] = club.castle
      ? this.castle(club, notice, member)
      : club.grid
        ? this.grid(club, notice, member)
        : this.clubIntro(club, notice, member);
    this.draw(screen, promptRow);
    this.ask(" >> ", (line) => {
      const c = line.trim().toLowerCase();
      if (!c) return this.clubHome(club);
      if (c === "p") return this.up();
      if (c === "j" || (club.castle && c === FNTSY_JOIN)) {
        if (member) return this.clubHome(club, ` 이미 가입한 회원입니다. 회원 ${this.members(club)}명.`);
        this.db.query("INSERT OR IGNORE INTO club_members (club, user, joined_at) VALUES (?, ?, ?)").run(club.go, this.user, Date.now());
        return this.clubHome(club, ` ${HL}${club.name}에 가입했습니다. 반갑습니다.${RS}`);
      }
      if (club.chat && c === club.chat.no) return this.enterChat({ no: `${club.go}:${c}`, name: `${club.name} ${club.chat.name}` }, () => this.clubHome(club));
      if (club.data && c === club.data.code) return this.clubData(club);
      if (club.info && c === club.info.no) {
        const j = this.db.query("SELECT joined_at FROM club_members WHERE club = ? AND user = ?").get(club.go, this.user) as { joined_at: number } | null;
        return this.clubHome(club, ` 회원 ${this.members(club)}명. ${j ? `${this.user}님은 ${kst(j.joined_at).slice(0, 10)}에 가입했습니다.` : "아직 가입하지 않았습니다. (J)"}`);
      }
      if (club.leave && c === club.leave.no) {
        if (!member) return this.clubHome(club, " 가입하지 않은 동호회입니다.");
        this.db.query("DELETE FROM club_members WHERE club = ? AND user = ?").run(club.go, this.user);
        return this.clubHome(club, ` ${club.name}에서 탈퇴했습니다. 다시 오시려면 J.`);
      }
      const sub = boards.find((b) => b.no === c);
      if (sub) {
        this.board = {
          key: `club:${club.go}:${sub.key ?? sub.no}`,
          code: `GO ${club.go.toUpperCase()}`,
          title: `${club.name} [${sub.name}]`,
          back: () => this.clubHome(club),
          canWrite: () => this.isMember(club),
        };
        return this.boardList(0);
      }
      if (this.nav(c)) return;
      this.clubHome(club, " 잘못된 명령입니다.");
    });
  }

  // 성 그림: 탑 셋(위에 작은 망루), 아래에 성벽. 번호가 곧 게시판이다.
  private castle(club: Club, notice: string, member: boolean): [string, number] {
    const W = "\x1b[0;1;37m";
    const merlons = (w: number) => "▄▄  ".repeat(Math.ceil(w / 4)).slice(0, w);
    const tower = (col: number, t: (typeof FNTSY_TOWERS)[number]) =>
      this.at(3, col + 6) + W + "┌" + "─".repeat(12) + "┐" +
      this.at(4, col + 6) + "│" + HL + center(t.turret, 12) + W + "│" +
      this.at(5, col) + merlons(26) +
      this.at(6, col) + "┌" + "─".repeat(24) + "┐" +
      t.items.map((l, i) => this.at(7 + i, col) + "│" + RS + pad(" " + l, 24) + W + "│").join("");
    const wall =
      this.at(14, 1) + W + merlons(78) +
      this.at(15, 1) + "┌" + "─".repeat(76) + "┐" +
      FNTSY_WALL.map((l, i) => this.at(16 + i, 1) + "│" + RS + pad("  " + l, 76) + W + "│").join("") +
      this.at(20, 1) + "└" + "─".repeat(76) + "┘" + RS;
    return [
      [
        this.header(club.go.toUpperCase(), club.name),
        ...FNTSY_TOWERS.map((t, i) => tower(1 + i * 26, t)),
        wall,
        this.at(21, 1) + (notice || `\x1b[1;36m Welcome to Fantasy World...${RS}   회원 ${this.members(club)}명${member ? " (가입)" : ""}`),
        this.at(23, 1) + ` 들어가기(번호) ${member ? "" : "가입(98) "}이전(P) 처음(T) 종료(X)`,
      ].join(""),
      24,
    ];
  }

  // 두 칸씩 늘어놓은 게시판 번호. 게시판이면 [글 수]를 붙인다.
  private grid(club: Club, notice: string, member: boolean): [string, number] {
    const g = club.grid!;
    const DIM = "\x1b[0;37m";
    const names: Record<string, string> = Object.fromEntries((club.boards ?? []).map((b) => [b.no, b.name]));
    if (club.chat) names[club.chat.no] = club.chat.name;
    if (club.data) names[club.data.code] = club.data.name;
    if (club.info) names[club.info.no] = club.info.name;
    if (club.leave) names[club.leave.no] = club.leave.name;
    // [새 글/전체]: 새 글은 지난번 접속을 끊은 뒤에 올라온 글. 처음 온 사람은 0이다.
    const count = (no: string) => {
      const r = this.db
        .query("SELECT count(*) AS n, count(CASE WHEN created_at > ? THEN 1 END) AS fresh FROM posts WHERE board = ?")
        .get(this.lastSeen ?? Number.MAX_SAFE_INTEGER, `club:${club.go}:${no}`) as { n: number; fresh: number };
      return `[${String(r.fresh).padStart(2)}/${String(r.n).padStart(3)}]`;
    };
    const cell = (no: string, w = 36) => {
      if (!no) return " ".repeat(w);
      const label = `${no.toUpperCase().padStart(2)}. ${names[no]}`;
      const bare = g.bare === true || g.bare?.includes(no);
      const n = (club.boards ?? []).some((b) => b.no === no) && !bare ? count(no) : "";
      return pad(label, w - n.length) + n;
    };
    const out = [this.header(`GO ${club.go.toUpperCase()}`, club.name), this.at(4, 1) + HL + center(g.title, 78) + RS];
    let row = 5;
    const rule = (labels: string[] = []) => {
      const w = Math.floor(78 / Math.max(1, labels.length));
      const line = labels.length ? labels.map((l) => center(` ${l} `, w).replace(/^ +| +$/g, (m) => "─".repeat(m.length))).join("") : "";
      out.push(this.at(row++, 1) + DIM + pad(line, 78).replace(/ +$/, (m) => "─".repeat(m.length)) + RS);
    };
    g.rows.forEach((sec, i) => {
      rule(g.labels?.[i]);
      for (const cells of sec)
        out.push(this.at(row++, 2) + (cells.length === 3 ? cells.map((c) => cell(c, 24)).join("  ") : cell(cells[0]) + "   " + cell(cells[1] ?? "")));
      if (i === 1 && g.banner) rule(), out.push(this.at(row++, 1) + center(g.banner, 78));
    });
    if (row <= 20) rule(); // 칸이 많아 화면이 차면 마지막 줄은 뺀다
    const at = Math.min(row + 1, 22);
    out.push(this.at(at, 1) + (notice || (g.motto ? `\x1b[1;36m ${g.motto}${RS}` : "")), this.at(at + 1, 1) + ` 들어가기(번호) ${member ? "" : "가입(J) "}이전(P) 처음(T) 종료(X)`);
    return [out.join(""), at + 2];
  }

  // 동호회 자료실: 번호·자료실명·자료수·최신등록일
  private clubData(club: Club, notice = "") {
    const d = club.data!;
    const key = (i: number) => `club:${club.go}:${d.code}:${i + 1}`;
    const rows = d.rooms.map((name, i) => {
      const r = this.db.query("SELECT count(*) AS n, max(created_at) AS last FROM posts WHERE board = ?").get(key(i)) as { n: number; last: number | null };
      return ` ${String(i + 1).padStart(4)}   ${pad(name, 44)}${String(r.n).padStart(6)}    ${r.last ? kst(r.last).slice(2, 10).replaceAll("-", "/") : ""}`;
    });
    this.draw(
      [
        this.header(`GO ${club.go.toUpperCase()}`, `${club.name} [${d.name}]`),
        this.head(4, 2, 76, pad(` 번호   ${pad("자 료 실 명", 44)}자료수    최신등록일`, 76), CYAN),
        this.lines(6, 1, rows),
        this.at(19, 1) + notice,
        this.at(20, 1) + " 들어가기(번호) 이전(P) 처음(T) 종료(X)",
      ].join(""),
      21,
    );
    this.ask(" >> ", (line) => {
      const c = line.trim().toLowerCase();
      if (!c) return this.clubData(club);
      if (c === "p") return this.clubHome(club);
      const i = Number(c) - 1;
      if (d.rooms[i]) {
        this.board = {
          key: key(i),
          code: `GO ${club.go.toUpperCase()}`,
          title: `${d.name} [${d.rooms[i]}]`,
          back: () => this.clubData(club),
          canWrite: () => this.isMember(club),
        };
        return this.boardList(0);
      }
      if (this.nav(c)) return;
      this.clubData(club, " 그런 자료실은 없습니다.");
    });
  }

  private clubIntro(club: Club, notice: string, member: boolean): [string, number] {
    const [info, next] = this.box(6, 4, 46, [
      "",
      ...club.desc.flatMap((l) => wrap(l, 42)).map((l) => " " + l),
      "",
      ` 회원 ${this.members(club)}명`,
      member ? " 가입한 동호회입니다." : " 아직 가입하지 않았습니다.",
      "",
    ]);
    return [
      [
        this.header(`GO ${club.go.toUpperCase()}`, club.name),
        this.head(4, 4, 46, "동호회 소개", PURPLE),
        info,
        this.head(4, 52, 24, "게시판", GREEN),
        this.lines(7, 54, (club.boards ?? CLUB_BOARDS).map((b) => `${b.no}. ${b.name}`)),
        this.at(next + 1, 1) + notice,
        this.at(next + 3, 1) + ` 들어가기(번호) ${member ? "" : "가입(J) "}이전(P) 처음(T) 종료(X)`,
      ].join(""),
      next + 4,
    ];
  }

  // ---- 하이텔문학관 ----

  private liter(notice = "") {
    const count = this.db.query("SELECT count(*) AS n FROM posts WHERE board = ?");
    const rows = LITER.map((b) => ` ${b.no}. ${pad(b.name, 20)}${String((count.get(`liter:${b.key}`) as { n: number }).n).padStart(4)}편`);
    const [list, next] = this.box(8, 16, 50, ["", ...rows, ""]);
    this.draw(
      [
        this.header("LITER", "하이텔문학관"),
        this.at(4, 4) + "PC통신에 연재되던 소설을 모아 읽는 곳입니다.",
        this.at(5, 4) + "감상은 독자 감상란에 남겨 주세요.",
        this.head(7, 16, 50, "문 학 관", PURPLE),
        list,
        this.at(next + 1, 1) + notice,
        this.at(next + 3, 1) + " 들어가기(번호) 이전(P) 처음(T) 종료(X)",
      ].join(""),
      next + 4,
    );
    this.ask(" >> ", (line) => {
      const c = line.trim().toLowerCase();
      if (!c) return this.liter();
      if (c === "p") return this.main();
      const b = LITER.find((x) => x.no === c);
      if (b) {
        this.board = {
          key: `liter:${b.key}`,
          code: "LITER",
          title: `하이텔문학관 [${b.name}]`,
          back: () => this.liter(),
          canWrite: () => !!b.open,
          denied: " 연재란은 읽기만 합니다. 감상은 독자 감상란(4)에 남겨 주세요.",
        };
        return this.boardList(0);
      }
      if (this.nav(c)) return;
      this.liter(" 그런 번호는 없습니다.");
    });
  }

  // ---- 게임/바둑 ----

  private gameMenu(notice = "") {
    const [list, next] = this.box(6, 12, 58, ["", " 1. 퀴즈방           go quiz   90년대 상식 다섯 문제", " 2. 바둑 대국실      (준비 중)", ""]);
    this.draw(
      [
        this.header("GAME", "게임/바둑"),
        this.head(4, 12, 58, "게 임 / 바 둑", GREEN),
        list,
        this.at(next + 1, 1) + notice,
        this.at(next + 3, 1) + " 들어가기(번호) 이전(P) 처음(T) 종료(X)",
      ].join(""),
      next + 4,
    );
    this.ask(" >> ", (line) => {
      const c = line.trim().toLowerCase();
      if (!c) return this.gameMenu();
      if (c === "p") return this.main();
      if (c === "1" || c === "go quiz" || c === "quiz") return this.quiz();
      if (c === "2") return this.gameMenu(" 바둑 대국실은 준비 중입니다.");
      if (this.nav(c)) return;
      this.gameMenu(" 그런 번호는 없습니다.");
    });
  }

  // 퀴즈방: 섞은 문제 다섯 개를 하나씩 낸다. 답은 번호로, Q는 그만.
  private quiz(qs = [...QUIZ].sort(() => Math.random() - 0.5).slice(0, QUIZ_ROUND), score = 0, notice = "") {
    const i = QUIZ_ROUND - qs.length;
    if (!qs.length) return this.quizEnd(score);
    const [q, choices, answer] = qs[0];
    this.draw(
      [
        this.header("QUIZ", "퀴즈방", `${i + 1}/${QUIZ_ROUND}  맞힌 문제 ${score}`),
        this.at(4, 2) + notice,
        this.head(7, 2, 76, ` 문제 ${i + 1}`, PURPLE),
        this.at(9, 4) + HL + q + RS,
        this.lines(11, 6, choices.map((c, n) => `${n + 1}. ${c}`)),
        this.at(20, 1) + " 답(1~4) 그만(Q)",
      ].join(""),
      21,
    );
    this.ask(" >> ", (line) => {
      const c = line.trim().toLowerCase();
      if (c === "q") return this.gameMenu();
      if (!/^[1-4]$/.test(c)) return this.quiz(qs, score, " 1에서 4 가운데 번호로 답해 주세요.");
      const ok = Number(c) === answer;
      this.quiz(qs.slice(1), score + (ok ? 1 : 0), ok ? ` ${HL}딩동댕! 맞았습니다.${RS}` : ` 땡! 정답은 ${answer}. ${choices[answer - 1]}`);
    });
  }

  private quizEnd(score: number) {
    const title = ["다시 도전해 보세요", "통신 새내기", "통신 새내기", "PC통신 고수", "PC통신 고수", "90년대 박사"][score];
    this.draw(
      [
        this.header("QUIZ", "퀴즈방"),
        this.head(7, 12, 58, "결 과", PURPLE),
        this.at(10, 14) + `${QUIZ_ROUND}문제 가운데 ${HL}${score}문제${RS}를 맞혔습니다.`,
        this.at(12, 14) + `칭호 : ${HL}${title}${RS}`,
        this.at(20, 1) + " 한 판 더(ENTER) 이전(P) 처음(T) 종료(X)",
      ].join(""),
      21,
    );
    this.ask(" >> ", (line) => {
      const c = line.trim().toLowerCase();
      if (!c) return this.quiz();
      if (c === "p") return this.gameMenu();
      if (this.nav(c)) return;
      this.quizEnd(score);
    });
  }

  // ---- 소모임 ----

  private smallCats(notice = "") {
    const rows = SMALLS.map((g, i) => ` ${i + 1}. ${pad(g.title, 18)}go ${pad(g.go, 8)}소모임 ${g.clubs.length}개`);
    const [list, next] = this.box(6, 12, 58, ["", ...rows, ""]);
    this.draw(
      [
        this.header("SMALL", "소모임 [분류]"),
        this.head(4, 12, 58, "주 제 별   소 모 임", PURPLE),
        list,
        this.at(next + 1, 1) + notice,
        this.at(next + 3, 1) + " 들어가기(번호) 이전(P) 처음(T) 종료(X)",
      ].join(""),
      next + 4,
    );
    this.ask(" >> ", (line) => {
      const c = line.trim().toLowerCase();
      if (!c) return this.smallCats();
      if (c === "p") return this.clubList();
      const cat = SMALLS[Number(c) - 1] ?? SMALLS.find((g) => g.go === c.replace(/^go /, ""));
      if (cat) return this.smallList(cat);
      if (this.nav(c)) return;
      this.smallCats(" 그런 분류는 없습니다.");
    });
  }

  // 하이텔 FFUN 화면처럼 번호 붙은 한 줄 목록
  private smallList(cat: Small, notice = "") {
    const rows = cat.clubs.map((cl, i) => `${String(i + 1).padStart(4)}. ${pad(cl.name, 50)}go ${cl.go}`);
    this.draw(
      [
        this.header(cat.go.toUpperCase(), `${cat.title} [분류]`),
        this.lines(4, 1, rows),
        this.at(21, 1) + notice,
        this.at(22, 1) + " 들어가기(번호) 이전(P) 처음(T) 종료(X)",
      ].join(""),
      23,
    );
    this.ask(" >> ", (line) => {
      const c = line.trim().toLowerCase();
      if (!c) return this.smallList(cat);
      if (c === "p") return this.smallCats();
      const club = cat.clubs[Number(c) - 1];
      if (club) return (this.up = () => this.smallList(cat)), this.clubHome(club);
      if (this.nav(c)) return;
      this.smallList(cat, " 그런 번호의 소모임은 없습니다.");
    });
  }

  // ---- 자료실 ----

  private dataList(notice = "") {
    this.draw(
      [
        this.header("GL", "자료실 [자료광장]"),
        ...DATA.map((d) => this.head(d.row, d.col, 24, d.section.title, d.color) + this.lines(d.row + 2, d.col, d.section.items.map((it) => `${it.no.padStart(2)}. ${it.name}`))),
        this.at(22, 1) + notice,
        this.at(23, 1) + " 들어가기(번호) 이전(P) 처음(T) 종료(X)",
      ].join(""),
      24,
    );
    this.ask(" >> ", (line) => {
      const c = line.trim().toLowerCase();
      if (!c) return this.dataList();
      if (c === "p") return this.main();
      const it = DATA.flatMap((d) => d.section.items).find((i) => i.no === c);
      if (it) {
        this.board = { key: `data:${it.no}`, code: "GL", title: `자료실 [${it.name}]`, back: () => this.dataList(), canWrite: () => true };
        return this.boardList(0);
      }
      if (this.nav(c)) return;
      this.dataList(" 그런 번호의 자료실은 없습니다.");
    });
  }

  // ---- 쪽지 ----

  private unread() {
    return (this.db.query("SELECT count(*) AS n FROM memos WHERE recipient = ? AND read_at IS NULL").get(this.user) as { n: number }).n;
  }

  private memoList(notice = "") {
    const memos = this.db
      .query("SELECT id, sender, body, created_at, read_at FROM memos WHERE recipient = ? ORDER BY id DESC LIMIT ?")
      .all(this.user, LIST_PAGE) as Memo[];
    this.memoIds = memos.map((m) => m.id);
    const rows = memos.map(
      (m, i) => ` ${String(i + 1).padStart(4)} ${m.read_at ? " " : `${HL}*${RS}`} ${pad(m.sender, 10)}${mmdd(m.created_at)}  ${pad(m.body, 48)}`,
    );
    this.draw(
      [
        this.header("MEMO", "쪽지함 [받은 쪽지]", `안 읽은 쪽지 ${this.unread()}통`),
        this.head(4, 2, 76, ` 번호   ${pad("보낸이", 10)}날짜   내용`, CYAN),
        this.lines(6, 1, rows.length ? rows : ["  받은 쪽지가 없습니다."]),
        this.at(20, 1) + notice,
        this.at(21, 1) + " 읽기(번호) 보내기(S) 이전(P) 처음(T) 종료(X)        * 안 읽은 쪽지",
      ].join(""),
      22,
    );
    this.ask(" >> ", (line) => {
      const c = line.trim().toLowerCase();
      if (!c) return this.memoList();
      const id = this.memoIds[Number(c) - 1];
      if (/^\d+$/.test(c)) return id ? this.memoRead(id) : this.memoList(" 그런 번호의 쪽지는 없습니다.");
      if (c === "s") return this.memoTo();
      if (c === "p") return this.main();
      if (this.nav(c)) return;
      this.memoList(" 잘못된 명령입니다.");
    });
  }

  private memoRead(id: number) {
    const m = this.db.query("SELECT * FROM memos WHERE id = ? AND recipient = ?").get(id, this.user) as Memo | null;
    if (!m) return this.memoList(" 그런 쪽지는 없습니다.");
    this.db.query("UPDATE memos SET read_at = ? WHERE id = ? AND read_at IS NULL").run(Date.now(), id);
    const [popup, next] = this.box(5, 10, 62, [
      "",
      ` 보낸이 ${HL}${m.sender}${PANEL}   ${kst(m.created_at).slice(0, 16)}`,
      "",
      ...wrap(m.body, 56).map((l) => " " + l),
      "",
    ]);
    this.draw(this.header("MEMO", "쪽지 읽기") + this.head(4, 10, 62, "쪽 지", GREEN) + popup, next + 1);
    this.ask(" 답장(R) 목록(엔터) >> ", (line) => {
      const c = line.trim().toLowerCase();
      if (c === "r") return this.memoBody(m.sender);
      if (c && this.nav(c)) return;
      this.memoList();
    });
  }

  private memoTo() {
    this.draw(this.header("MEMO", "쪽지 보내기") + this.at(4, 1) + "  받는 사람을 비워 두면 취소됩니다.", 6);
    this.ask(" 받는 사람 ID : ", (line) => {
      const to = line.trim().toLowerCase();
      if (!to) return this.memoList(" 쪽지 보내기를 취소했습니다.");
      if (!this.db.query("SELECT 1 FROM users WHERE id = ?").get(to)) {
        this.print(`  '${to}'라는 ID는 없습니다.`);
        return this.memoTo();
      }
      this.memoBody(to);
    });
  }

  private memoBody(to: string) {
    this.print(`  ${to}님에게 보낼 내용을 한 줄로 쓰세요. (최대 ${MAX_MEMO}자, 비우면 취소)`);
    this.ask(" 내용 : ", (line) => {
      const body = line.trim().slice(0, MAX_MEMO);
      if (!body) return this.memoList(" 쪽지 보내기를 취소했습니다.");
      this.db.query("INSERT INTO memos (sender, recipient, body, created_at) VALUES (?, ?, ?, ?)").run(this.user, to, body, Date.now());
      for (const s of online) if (s.user === to) s.print(` *** ${HL}${this.user}님에게서 쪽지가 왔습니다.${RS} (go memo)`);
      this.memoList(` ${to}님에게 쪽지를 보냈습니다.`);
    });
  }

  // ---- 대화실 ----

  // 대화실 [분류]: 테두리 상자 여섯 개. 방 이름 옆 (n)은 지금 있는 사람 수.
  private chatList(notice = "") {
    const frame = (row: number, col: number, sec: Section) => {
      const w = 26;
      const left = Math.floor((w - 2 - cells(sec.title)) / 2);
      const B = "\x1b[0;1;37m";
      let out = this.at(row, col) + B + "┌" + "─".repeat(left) + HL + sec.title + B + "─".repeat(w - 2 - left - cells(sec.title)) + "┐";
      for (let i = 0; i < 6; i++) {
        const it = sec.items[i];
        const n = it ? this.people(it.no) : 0;
        const text = it ? pad(` ${it.no}.${it.name}`, n ? 20 : 24) + (n ? HL + pad(`(${n})`, 4) : "") : " ".repeat(24);
        out += this.at(row + 1 + i, col) + B + "│" + RS + text + B + "│";
      }
      return out + this.at(row + 7, col) + B + "└" + "─".repeat(w - 2) + "┘" + RS;
    };
    this.draw(
      [
        this.header("CHATTING", "대화실 [분류]"),
        ...CHATS.map((sec, i) => frame(i < 3 ? 3 : 11, 1 + (i % 3) * 26, sec)),
        this.at(19, 1) + notice,
        this.at(20, 1) + " 들어가기(번호) 이전(P) 처음(T) 종료(X)",
      ].join(""),
      21,
    );
    this.ask(" >> ", (line) => {
      const c = line.trim().toLowerCase();
      if (!c) return this.chatList();
      if (c === "p") return this.main();
      const cat = ROOMS.find((r) => r.no === c);
      if (cat) return this.userRooms(cat);
      if (c === CHAT_GUIDE) return this.chatList(" 분류에 들어가 개설(O)로 누구나 방을 엽니다. 참가자 /W, 나가기 /Q, 호칭은 '님'.");
      if (c === CHAT_MEMO) {
        this.board = { key: "chat:memo", code: "CHATTING", title: "대화실 메모란", back: () => this.chatList(), canWrite: () => true };
        return this.boardList(0);
      }
      if (this.nav(c)) return;
      this.chatList(" 그런 번호의 대화실은 없습니다.");
    });
  }

  // 분류 하나에 열린 채팅방들. 누구나 제목만 정해 열고, 방장은 없앨 수 있다.
  private roomsIn(cat: string) {
    return this.db.query("SELECT id, topic, owner FROM chat_rooms WHERE category = ? ORDER BY id LIMIT ?").all(cat, MAX_ROOMS) as ChatRoom[];
  }

  private people(cat: string) {
    return this.roomsIn(cat).reduce((n, r) => n + (rooms.get(roomKey(r.id))?.size ?? 0), 0);
  }

  private userRooms(cat: Category, notice = "") {
    const list = this.roomsIn(cat.no);
    const rows = list.map((r, i) => {
      const n = rooms.get(roomKey(r.id))?.size ?? 0;
      return ` ${String(i + 1).padStart(4)}   ${pad(r.topic, TOPIC_CELLS + 2)}${pad(r.owner, 10)}${n ? HL + `${n}명` + RS : "  -"}`;
    });
    this.draw(
      [
        this.header("CHATTING", `${cat.no}.${cat.name}`),
        this.head(4, 2, 76, ` 번호   ${pad("채 팅 방  제 목", TOPIC_CELLS + 2)}${pad("방장", 10)}인원`, CYAN),
        this.lines(6, 1, rows.length ? rows : ["  열린 채팅방이 없습니다. 개설(O)로 첫 방을 열어 보세요."]),
        this.at(20, 1) + notice,
        this.at(21, 1) + " 들어가기(번호) 개설(O) 폐쇄(D 번호) 이전(P) 처음(T) 종료(X)",
      ].join(""),
      22,
    );
    const back = () => this.userRooms(cat);
    this.ask(" >> ", (line) => {
      const c = line.trim().toLowerCase();
      if (!c) return back();
      if (c === "p") return this.chatList();
      if (c === "o") return this.openRoom(cat);
      const del = c.match(/^d\s*(\d+)$/);
      if (del) return this.closeRoom(cat, list[Number(del[1]) - 1]);
      if (/^\d+$/.test(c)) {
        const r = list[Number(c) - 1];
        return r ? this.enterChat({ no: roomKey(r.id), name: r.topic }, back) : this.userRooms(cat, " 그런 번호의 채팅방은 없습니다.");
      }
      if (this.nav(c)) return;
      this.userRooms(cat, " 잘못된 명령입니다.");
    });
  }

  private openRoom(cat: Category) {
    if (this.roomsIn(cat.no).length >= MAX_ROOMS) return this.userRooms(cat, " 채팅방이 꽉 찼습니다. 빈 자리가 생기면 다시 열어 주세요.");
    this.ask(`  채팅방 제목(한글 ${TOPIC_CELLS / 2}자까지, 엔터는 취소) : `, (line) => {
      const topic = pad(clean(line).trim(), TOPIC_CELLS).trimEnd();
      if (!topic) return this.userRooms(cat, " 채팅방 개설을 취소했습니다.");
      const { lastInsertRowid } = this.db
        .query("INSERT INTO chat_rooms (category, topic, owner, created_at) VALUES (?, ?, ?, ?)")
        .run(cat.no, topic, this.user, Date.now());
      this.enterChat({ no: roomKey(Number(lastInsertRowid)), name: topic }, () => this.userRooms(cat));
    });
  }

  private closeRoom(cat: Category, r?: ChatRoom) {
    if (!r) return this.userRooms(cat, " 그런 번호의 채팅방은 없습니다.");
    if (r.owner !== this.user) return this.userRooms(cat, " 방장만 채팅방을 없앨 수 있습니다.");
    this.db.query("DELETE FROM chat_rooms WHERE id = ?").run(r.id);
    // 안에 있던 사람은 알리고 목록으로 돌려보낸다
    for (const s of [...(rooms.get(roomKey(r.id)) ?? [])]) {
      s.leaveChat(true);
      s.userRooms(cat, ` *** 방장이 '${r.topic}' 방을 없앴습니다.`);
    }
    rooms.delete(roomKey(r.id));
    this.userRooms(cat, ` '${r.topic}' 방을 없앴습니다.`);
  }

  private enterChat(room: { no: string; name: string }, back = () => this.chatList()) {
    this.chatBack = back;
    const people = rooms.get(room.no) ?? new Set<Session>();
    rooms.set(room.no, people);
    people.add(this);
    this.room = room;
    this.draw(this.header("CHATTING", room.name, `지금 ${people.size}명`), 4);
    this.print(" 들어왔습니다. '님' 문화를 지켜 주세요.   참가자(/W) 나가기(/Q)");
    this.broadcast(` *** ${this.user}님이 들어오셨습니다. (지금 ${people.size}명)`, this); // 머리 줄의 사람 수는 들어올 때 한 번만 그려진다
    this.chatTimer = setTimeout(() => this.print(" *** 대화실에 25분째 계십니다. 잠시 쉬어 가세요."), CHAT_WARN_MS);
    this.chatPrompt();
  }

  private chatPrompt() {
    this.ask("> ", (line) => {
      const c = line.trim();
      if (c === "/q") {
        this.leaveChat();
        return this.chatBack();
      }
      if (c === "/w") this.print(" 참가자: " + [...(rooms.get(this.room!.no) ?? [])].map((s) => s.user).join(", "));
      else if (c) this.broadcast(`[${this.user}] ${c}`);
      this.chatPrompt();
    });
  }

  private broadcast(msg: string, except?: Session) {
    for (const s of rooms.get(this.room?.no ?? "") ?? []) if (s !== except) s.print(msg);
  }

  private leaveChat(quiet = false) {
    const people = this.room && rooms.get(this.room.no);
    if (!people?.delete(this)) return;
    clearTimeout(this.chatTimer);
    if (!quiet) this.broadcast(` *** ${this.user}님이 나가셨습니다. (지금 ${people.size}명)`);
    if (!people.size) rooms.delete(this.room!.no);
    this.room = undefined;
  }
}
