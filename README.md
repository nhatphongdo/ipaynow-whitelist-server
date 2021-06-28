# Setup

## permissions

### Rate

`public`

- find

### Interest

`authenticated`

- claim

### Account

`public`

- merchant
- merchants
  
`authenticated`

- addReferral
- history
- merchantReview
- profile
- referralInfo
- update
- updateMerchant
- upload
- updatePushToken
- contacts
- updateContact
- cancelMerchant
- deleteContact

### Reward

`authenticated`

- info

### Setting

`public`

- find
  
### Game

`public`

- find
- findOne

`authenticated`

- buyLuckyNumber
- luckyNumbers
- leaderBoards

### Earn

`public`

- find

`authenticated`

- apply

### Category

`public`

- find
  
### Transaction

`authenticated`

- send

### Store

`public`

- find

`authenticated`

- purchase
- pay

### Exchanges

`public`

- find

`authenticated`

- create
- withdraw

### Trade

`authenticated`

- find
- findOne
- create
- approve
- reject

### Notifications

`authenticated`

- findOne
- find
- readNotification

### Users-Permissions Auth

`public`

- connect
- forgotPassword
- callback
- register
- emailConfirmation
- changePassword

`authenticated`

- connect

### Users-Permissions Me

`public`

- me

`authenticated`

- me

### Users-Permissions UserPermission

`public`

- init

`authenticated`

- init
  
## Settings

| name                                       | serverOnly | value                                                                                       |
|--------------------------------------------|------------|---------------------------------------------------------------------------------------------|
| blockchain.last-block                      | True       | 7425490                                                                                     |
| account.current-id                         | True       | 62                                                                                          |
| blockchain.central-wallet                  | False      | 0x0F6cb703b00d73c55200a749B59c1125e95c8ae5                                                  |
| buy-reward.options                         | False      | 10,50,100,500,1000,5000,10000,20000,50000,100000                                            |
| buy-reward.ratio                           | False      | 1                                                                                           |
| global.coin-market-cap-api-key             | True       | fdced435-d36b-48f5-a392-decf161c5964                                                        |
| global.coin-market-cap-api-free            | True       | 1                                                                                           |
| reward.rebate-rate                         | False      | 0.01                                                                                        |
| reward.interest-rate                       | True       | 0.0007                                                                                      |
| global.supported-currencies                | True       | USD,AUD,KHR,CAD,CNY,EUR,HKD,INR,IDR,JPY,MYR,MMK,TWD,NZD,PHP,GBP,RUB,SGD,KRW,CHF,THB,VND,BTC |
| reward.receive-split-ratio                 | True       | 1                                                                                           |
| referral.level-1.bonus                     | True       | 0.02                                                                                        |
| referral.level-2.bonus                     | True       | 0.01                                                                                        |
| account.new-user-reward                    | True       | 10                                                                                          |
| blockchain.distributing-wallet-private-key | True       | 0x72d1b3954d21571b9fb9681f3a8df6738bf53908df592e608f4137b2fed1f4e9                          |
| reward.intereset-threshold-send            | False      | 20                                                                                          |
| store.wallet                               | False      | 0x5634cbf534491d0d8a2f2f5a7f03451c9e026631                                                  |
| store.numbers-per-item                     | True       | 8                                                                                           |
| exchange.escrow-wallet                     | False      | 0xc1fE2b823bC920df811298911f48af3431BB971a                                                  |
| exchange.day-limit-amount                  | True       | 5000                                                                                        |
| exchange.day-limit-times                   | True       | 10                                                                                          |
| exchange.min-amount                        | True       | 10                                                                                          |
| exchange.fee-rate                          | False      | 0.05                                                                                        |
| exchange.escrow-wallet-private-key         | True       | 0x58acd603666d41e82bdd7209123a2ecd50668e1e0e17ad436e9a7bd99ad6e1cd                          |

## Games

| name         | startTime              | endTime                | endJoinTime            | repeat | repeatFrom             | enabled | description  | type         | cost | unit   | prize | prizeUnit |
|--------------|------------------------|------------------------|------------------------|--------|------------------------|---------|--------------|--------------|------|--------|-------|-----------|
| Lucky Draw   | 2020-02-16 00:00:00+07 | 2020-02-16 23:30:00+07 | 2020-02-16 23:30:00+07 | 1d     | 2020-02-16 12:00:00+07 | True    | NULL         | Lucky Draw   | 10   | Reward | 100   | Reward    |
| Rolling Dice | 2020-02-16 12:00:00+07 | 2020-02-16 19:00:00+07 | NULL                   | 1d     | NULL                   | True    | Rolling Dice | Rolling Dice | 5    | Reward | 50    | Reward    |

## Formats

| format | type           | enabled | validation |
|--------|----------------|---------|------------|
| 40     | Account Number | True    | Compare    |
| 41-49  | Account Number | True    | Range      |
| 5[1-9] | Account Number | True    | Regex      |
| aa     | Account Number | True    | Pattern    |
| 1-39   | Account Number | True    | Range      |

## Earns

| name    | wholeRate | lockPeriodValue | lockPeriodUnit |
|---------|-----------|-----------------|----------------|
| 7 days  | 1         | 7               | Day            |
| 2 weeks | 2         | 2               | Week           |
| 1 day   | 13        | 1               | Day            |

## Rates

| baseCurrency    | foreignCurrency | rate | source  |
|-----------------|-----------------|------|---------|
| usdt            | reward          | 1    | CMC     |
