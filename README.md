# Ship From Slack

> **작은 변경을, 가장 짧은 피드백 루프로 완성합니다.**

Ship From Slack은
**작은 변경의 병목은 구현이 아니라 커뮤니케이션**이라는 전제에서 시작합니다.

문구 하나, 버튼 위치 하나를 바꾸기 위해
설명하고, 기다리고, 다시 확인하는 과정을
**Slack 안의 하나의 쓰레드**로 끝내기 위해 만들어졌습니다.

👉 바로 셋업하고 싶다면 여기부터 보세요:
[Setup & Installation](#%EF%B8%8F-setup--installation)

---

## 🎯 What This Repository Does

**Ship From Slack**은
작고 빈번한 코드 변경을 위해 설계된
**Slack 중심의 코드 변경 워크플로우**입니다.

* Slack에서 자연어로 변경 요청
* 봇이 질문하며 요청 의도를 정제
* AI가 코드 변경을 구현하고 Pull Request 생성
* Preview 환경에서 결과를 즉시 확인
* 같은 Slack 쓰레드에서 반복 개선

Ship From Slack은 Slack에 상주하는 **AI 인턴**처럼 동작합니다.

바로 구현하지 않고, 필요한 질문으로 의도를 정리한 뒤 결과를 Preview로 보여주며 같은 쓰레드에서 계속 다듬어 나갑니다.

핵심은 자동화가 아니라
**요청자가 직접 보고, 바로 다시 고칠 수 있는 구조**입니다.

<img src="./docs/example.png" width="400" alt="Slack 대화 예시 — 요청 접수, 의도 정제, PR 생성, Preview 링크 제공까지의 전체 흐름" />

---

## 🧪 Examples

### 변경 요청

```
/request FAQ에 "환불 절차는 어떻게 되나요?" 질문 추가해줘
```

→ PR 생성
→ Preview 링크 제공
→ 바로 확인

---

### 확인 후 추가 수정

같은 Slack 쓰레드에서:

```
답변 문구를 조금 더 친절하게 바꿔줘
```

→ 기존 PR에 커밋 추가
→ Preview 자동 갱신

---

### 요청이 모호한 경우

```
/request 마감일 수정해줘
```

```
🤔 확인이 필요해요!
• 어떤 마감일을 변경할까요?
• 변경할 날짜는 언제인가요?
```

→ 답변 후 구현 시작

---

---

## 🔑 Core Idea

> **작은 변경일수록**
> **직접 보고, 바로 다시 고칠 수 있어야 한다**

Ship From Slack은
길고 단절된 프로세스를 자동화하는 대신
**짧은 피드백 루프를 설계**하는 데 집중합니다.

AI, Pull Request, Preview 배포는
이 루프를 가능하게 하기 위한 수단입니다.

### Built With

| 기술 | 역할 |
|------|------|
| **Vercel** | Slack Bot 호스팅 + Preview 배포 |
| **Claude Agent SDK** | AI 기반 코드 분석 및 변경 구현 |
| **GitHub Actions** | CI/CD 파이프라인, PR 자동 생성 |

---

## 🧭 Who This Is For

### 비엔지니어

* 개발자 도움 없이 Slack에서 직접 요청
* Preview 링크로 결과 즉시 확인
* 같은 쓰레드에서 추가 요청 가능
* **요청자가 스스로 완성도를 끌어올리는 구조**

### 엔지니어

* 반복적인 소규모 수정 요청 부담 감소
* AI가 작업할 수 있는 기준과 가드만 정의
* 구현보다 **설계, 품질, 의사결정에 집중**

---

## 🏗 How It Works

```
Slack (/request)
   ↓
요구사항 정제 (Bot ↔ 사용자)
   ↓
코드 분석 · 변경 구현 (AI)
   ↓
Pull Request 생성
   ↓
Preview 배포
   ↓
결과 확인 → 같은 쓰레드에서 추가 요청
```

모든 대화와 변경 맥락은
**하나의 Slack 쓰레드**에 유지됩니다.

---

## 📌 What This Is (and Isn’t)

### This is

* Slack 기반 변경 요청 인터페이스
* AI를 활용한 코드 분석 및 변경 구현
* Preview를 중심으로 한 반복 피드백 루프

### This is NOT

* 프로덕션 자동 배포 시스템
* 리뷰 없이 머지되는 코드 생성기
* 복잡한 설계 판단의 완전 자동화

Ship From Slack은
**기존 개발 프로세스를 대체하지 않습니다.**
작은 변경을 더 가볍게 처리하기 위한 보조 레이어입니다.

---

## ⚙️ Setup & Installation

### Required

| 구성 요소                 | 역할                                                         |
| --------------------- | ---------------------------------------------------------- |
| **Slack App**         | Slash Command (`/request`), Bot Token, Event Subscriptions |
| **GitHub PAT**        | Repository 접근, PR 생성, Actions 트리거                          |
| **Anthropic API Key** | Claude Code 호출                                             |
| **Vercel**            | Slack Bot 호스팅 + Preview 배포                                 |

### Environment Variables

#### Vercel (Slack Bot)

| 변수                     | 설명                           |
| ---------------------- | ---------------------------- |
| `SLACK_BOT_TOKEN`      | Slack Bot User OAuth Token   |
| `SLACK_SIGNING_SECRET` | Slack App Signing Secret     |
| `GITHUB_TOKEN`         | GitHub Personal Access Token |
| `GITHUB_REPO`          | 타겟 레포 (`owner/repo` 형식)      |

#### GitHub Actions Secrets (타겟 레포)

| Secret              | 설명                                                            |
| ------------------- | ------------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | Claude API 키                                                  |
| `SLACK_BOT_TOKEN`   | Slack Bot User OAuth Token                                    |
| `PAT_TOKEN`         | GitHub Personal Access Token (`repo`, `workflow`, `read:org`) |
| `VERCEL_TOKEN`      | Vercel 배포 토큰                                                  |
| `VERCEL_ORG_ID`     | Vercel Organization ID                                        |
| `VERCEL_PROJECT_ID` | Vercel Project ID                                             |

### Setup Guide

처음 설정한다면 아래 문서만 순서대로 따라가면 됩니다.

👉 [통합 설정 가이드](docs/SETUP-GUIDE.md)

Slack App 생성, Vercel 배포, Slack URL 연결, 타겟 레포 Workflow, GitHub Secrets, Preview 배포, 동작 확인까지 한 흐름으로 정리되어 있습니다.

---

## 📚 관련 문서

| 문서                                         | 설명                          |
| ------------------------------------------ | --------------------------- |
| [Slack Bot 설정 가이드](apps/slack-bot/README.md) | Slack App 생성, Vercel 배포, URL 연결 세부 참고 |
| [타겟 레포 설정 가이드](docs/USAGE-GUIDE.md)             | Workflow YAML 예시, Secrets 설정 세부 참고 |
| [요청 흐름 상태 관리](docs/request-flow-states.md) | 내부 상태 머신, Payload 구조 (개발자용) |
