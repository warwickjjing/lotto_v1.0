// scripts/fetch-lotto.js
// 매주 자동 실행되어, 최신 회차의 당첨번호를 data/lotto-history.json 에 누적 저장합니다.
// 실행 주체는 사용자 자신의 GitHub Actions 워크플로우이며, 동행복권 서버에 대한
// 접근 정책(robots.txt 등)은 실행 전 반드시 다시 한번 직접 확인하시기 바랍니다.

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'data', 'lotto-history.json');
const COMMON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9',
};

// 메인 페이지를 먼저 방문해서 세션 쿠키를 받아옴 (쿠키 없이 API를 바로 호출하면
// 로그인 페이지로 리다이렉트되는 문제가 있어, 실제 브라우저 흐름을 흉내냄)
async function getSessionCookie() {
  const res = await fetch('https://www.dhlottery.co.kr/common.do?method=main', {
    headers: COMMON_HEADERS,
  });
  const setCookie = res.headers.get('set-cookie') || '';
  // 여러 개의 Set-Cookie가 콤마로 합쳐져 오는 경우도 있어 세미콜론 기준 앞부분만 추출
  const cookiePairs = setCookie.split(/,(?=[^;]+?=)/).map(c => c.split(';')[0].trim());
  return cookiePairs.filter(Boolean).join('; ');
}

async function fetchDraw(drwNo, cookie) {
  const url = `https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${drwNo}`;
  const res = await fetch(url, {
    headers: {
      ...COMMON_HEADERS,
      'Accept': 'application/json, text/plain, */*',
      'Referer': 'https://www.dhlottery.co.kr/gameResult.do?method=byWin',
      'Cookie': cookie,
    }
  });

  const text = await res.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error(`[drwNo=${drwNo}] HTTP status: ${res.status}`);
    console.error(`[drwNo=${drwNo}] 응답 본문 앞부분: ${text.slice(0, 300)}`);
    throw new Error(`JSON 파싱 실패 (drwNo=${drwNo}) - 서버가 차단했을 가능성이 높습니다`);
  }

  if (data.returnValue !== 'success') return null;
  return {
    drwNo: data.drwNo,
    date: data.drwNoDate,
    numbers: [data.drwtNo1, data.drwtNo2, data.drwtNo3, data.drwtNo4, data.drwtNo5, data.drwtNo6],
    bonus: data.bnusNo,
  };
}

async function main() {
  let history = [];
  if (fs.existsSync(DATA_PATH)) {
    history = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  }

  const cookie = await getSessionCookie();
  console.log(`세션 쿠키 확보: ${cookie ? '성공' : '없음(쿠키 미발급 사이트일 수 있음)'}`);

  const lastKnown = history.length ? history[history.length - 1].drwNo : 0;
  let nextNo = lastKnown + 1;
  let added = 0;

  // 최신 회차까지 순차적으로 조회 (한 번 실행에 최대 10회차까지만, 과도한 요청 방지)
  while (added < 10) {
    let draw;
    try {
      draw = await fetchDraw(nextNo, cookie);
    } catch (e) {
      console.error(`회차 ${nextNo} 조회 중 오류 발생, 이번 실행은 여기서 중단합니다.`);
      console.error(e.message);
      break;
    }
    if (!draw) break;
    history.push(draw);
    nextNo++;
    added++;
    await new Promise(r => setTimeout(r, 300)); // 과도한 연속 요청 방지
  }

  if (added > 0) {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify(history, null, 2));
    console.log(`${added}개 회차 추가됨 (최신: ${nextNo - 1}회)`);
  } else {
    console.log('추가할 새 회차 없음');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
