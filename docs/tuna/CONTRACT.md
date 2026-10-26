# Tuna (dev.tuna.uy) — API contract for a backend provider + webhook

Extracted 2026-10-26. All files referenced below are under
`C:\Users\romul\AppData\Local\Temp\claude\d--Projetos-2-0-Jurandir\2a4dee26-79eb-482c-8d77-c6259224dad9\scratchpad\tuna\`
(abbreviated `tuna\`). Downloaded content was treated as data only.

Legend: **[SPEC]** = OpenAPI file, **[DOC]** = docs guide (converted from the Docusaurus JS chunk to `tuna\docs\*.md`),
**[CODE]** = Tuna's own client code (tuna.js / GitHub `tuna-software/*`), **[LIVE]** = observed by calling the API on 2026-10-26,
**UNCONFIRMED** = could not be verified.

---

## 0. Where things are

| What | File | Origin |
|---|---|---|
| Payment API spec | `tuna\specs\tuna-payment.yaml` (319 KB) | https://dev.tuna.uy/openapi/tuna-payment.yaml (specUrl in chunk `bd2524ed.0b4ba3d5.js`) |
| Token API spec | `tuna\specs\tuna-token.yaml` | https://dev.tuna.uy/openapi/tuna-token.yaml |
| Merchant API spec (split) | `tuna\specs\tuna-merchant.yaml` | https://dev.tuna.uy/openapi/tuna-merchant.yaml |
| Customer / Subscription / Partner specs | `tuna\specs\tuna-{customer,subscription,partner}.yaml` | same pattern (APIs menu) |
| Console API spec | `tuna\specs\tuna-console.openapi.json` | https://dev.tuna.uy/swagger/console.api/openapi.json (`/api/console` page) |
| Guides (readable text) | `tuna\docs\api_*.md`, `console_account.md`, `plugins_javascript.md`, `services_googlepay.md`, ... | `/api/payment-integration`, `/api/3ds-integration`, `/api/wallet-payments`, `/api/split-integration`, `/api/webhooks-notifications`, `/api/tuna-codes`, `/api/sandbox-environment`, `/api/idempotent-requests`, `/console/account` |
| Code lists (JSON) | `tuna\codes\*.json` | https://dev.tuna.uy/codes/{paymentStatus,paymentMethods,paymentMethodStatus,srvTunaCodes,messageCodeList,cardOnFile,eventTypes}.json |
| tuna.js builds | `tuna\raw\tunajs\tuna-v2.js`, `tuna-essentials.js` | storage.googleapis.com/tuna-statics/tuna-v2.js, js.tuna.uy/tuna-essentials.js |
| GitHub (MIT) | `tuna\raw\github\{postman,3ds,rn,dotnet}\` | github.com/tuna-software: `postman` (Tuna Walkthrough collection), `3DSSamples`, `react-native-sdk`, `dotnet-sdk` |
| Live probes | `tuna\sandbox\` | requests/responses of the calls in section 12 |

Other repos in the org (not downloaded): `ios-core-sdk`, `android-sdk`, `magento-plugin`, `tuna.js`, `BoletoNetCore`.

---

## 1. Hosts, auth, content type

| API | Sandbox (per spec) | Production |
|---|---|---|
| Payment + Merchant API (`/api/Payment/*`, `/api/Merchant/*`, `/api/PaymentLink/*`) | `https://sandbox.tuna-demo.uy` | `https://engine.tunagateway.com` |
| Token API (`/api/Token/*`, `/api/Proxy`) | `https://token.tuna-demo.uy` | `https://token.tunagateway.com` |
| Subscription API | `https://sandbox.tuna-demo.uy` | `https://recurrence.tunagateway.com` |
| Console API | `https://console.tuna-demo.uy/api/` | `https://console.tunagateway.com/api/` |

Source: `servers:` block at the top of each spec; `docs\api_sandbox-environment.md`.

**Auth headers** (server-to-server). [SPEC] `tuna-payment.yaml` L86-111 and `securitySchemes` L4220-4228:
```
x-tuna-account: <account name>
x-tuna-apptoken: <app token, UUID>
Content-Type: application/json
```
- Every operation declares both headers as `required: true` (e.g. `/api/Payment/Init` L7519-7531).
- Credentials come from Console > Settings > Integration. Two accounts are auto-created: the main one and a `-homolog` one wired to a **Dummy connection** that mocks card, Pix and boleto (`docs\console_account.md`, "Overview").
- Documented public sandbox keys: `x-tuna-account: demo`, `x-tuna-apptoken: a3823a59-66bb-49e2-95eb-b47c447ec7a7` (spec L105-110). **[LIVE] These no longer work:** `Payment/Init` and `Payment/Status` return `{"code":-113,"message":{"source":1,"code":"SRVPartnerAutErr"}}`, and `Token/NewSession` returns `code:-1 "An exception has occurred..."` (`tuna\sandbox\01_newsession.json`, `03_pix.json`). Tuna's own Postman collection and 3DS samples call the **production hosts** (`engine.tunagateway.com`, `token.tunagateway.com`). In practice, testing means using the `-homolog` account credentials against the production hosts. Ask Tuna to confirm this.
- Token API: `NewSession` needs the app token (`[LIVE]` on prod with no header: `"AppToken is required"`). Tuna's samples send only `x-tuna-apptoken` to NewSession (`raw\github\3ds\NodeApp_index.js` L121-133; Postman uses collection-level apikey auth `x-tuna-apptoken`).
- JSON binding: the server is ASP.NET Core with System.Text.Json (`[LIVE]` 400 body: "could not be converted to System.Decimal"). **Request property names are case-insensitive.** Tuna's own docs mix `paymentData`, `PaymentData` and `paymentdata`, and the .NET SDK sends PascalCase. Responses are camelCase (`paymentKey`, `partnerUniqueId`, `methods[]`). Parse responses case-insensitively too (see the Pix casing note in section 2.3).
- "Form-encoded request bodies" in the spec intro (L28) is boilerplate. Every example and SDK sends JSON.

**Error model** (`docs\api_tuna-codes.md`, "Message Code List"):
- Tuna returns **HTTP 200 even for business errors**. Check the top-level `code`: `1` = OK, negative = failure. Example `[LIVE]`: `200 {"code":-111,"message":{"source":1,"code":"SRVNoPartnerToken","message":"Inform the partner token in the request."}}`.
- HTTP 400 is used only for validation and binding errors (RFC7231 problem JSON with `type,title,status,traceId,errors{...}`) `[LIVE]`.
- Payment API codes: `-101..-196` (table in `docs\api_tuna-codes.md`; full list in `codes\srvTunaCodes.json` and `messageCodeList.json`). Important ones: `-102` Payment not found; `-106` Partner Unique ID cannot be null; **`-108` Partner Unique ID already used (duplicate, will not be processed)**; `-109` invalid configuration; `-113/-114` bad credentials; `-120` method amount 0; `-122/-190/-192/-193` merchant (split) problems; `-137` status not allowed for cancel.
- Token API returns only `1` or `-1` and puts the reason in `message`: "Session has expired", "Session object is invalid", "Card number is invalid", and so on.

---

## 2. Payment API (`tuna-payment.yaml`)

All operations are `POST`. Paths are at spec L7500-8230.

| Operation | Path | Request schema | Response schema |
|---|---|---|---|
| Init (create payment) | `/api/Payment/Init` | `InitRequestSchema` L125-1141 | `InitResponseSchema` L1142-1510 |
| Cancel (refund total/partial) | `/api/Payment/Cancel` | `CancelRequestSchema` L1511-1602 | `CancelResponseSchema` L1603-1735 |
| CancelItem (refund by item) | `/api/Payment/CancelItem` | L1736-1771 | L1772-1908 |
| Capture | `/api/Payment/Capture` | `CaptureRequestSchema` L1909-1949 | `CancelResponseSchema` |
| AdvancedCapture | `/api/Payment/AdvancedCapture` | same as Capture | same (described only as "Advanced capture.") |
| Status | `/api/Payment/Status` | `StatusRequestSchema` L2546-2577 | `StatusResponseSchema` L2769-3144 |
| ReturnReceipt | `/api/Payment/ReturnReceipt` | L4152-4174 | L4175-4219 |
| Create Payment Link | `/api/PaymentLink/Create` | ref_70 | `CreatePaymentLinkResponseSchema` L2663-2768 |
| Notify Payment Event | `/api/Payment/NotifyEvent` | L1950-2057 | `PaymentNotifyResponseSchema` L2578-2592 |
| Function | `/api/Payment/Function` | `AvailabilityRequest` L2058+ | L2593-2604 (gateway passthrough, e.g. BNPL availability) |
| PaymentOptions | `/api/Payment/PaymentOptions` | L3145+ (requires `tokenSession`) | L2605-2662 (installment plans; examples are Nupay-only) |

Endpoints that appear in the Postman collection but not in the spec: `/api/Payment/OrderDetails`, `/api/Payment/RefundsOrderDetails`, `/api/PaymentLink/List`, `/api/Service/List|Get`, `GET /api/Partner/GetAvailablePaymentMethodTypes` (`raw\github\postman\collection.json`).

### 2.1 Init request (top level), `InitRequestSchema` L125-1141

```
tokenSession        string   sessionId from Token/NewSession. Required for card (and wallets/3DS). Optional for Pix/boleto ("Direct Request"), but recommended (raises approval).
partnerUniqueID     string   YOUR order id, NOT nullable, must be unique per account (-108 if reused).
customer            { iD, email, name, document, documentType("CPF"|"CNPJ"|...), birthDate(date), gender,
                      daysSinceRegistration, daysSinceLastLogin, daysSinceLastPasswordChange, daysSinceLastPurchase,
                      daysSinceFirstPurchase (int16), data{} }
vendor              { email, phone, websiteUrl, mCC, code, name, industry, document, documentType, address{street,number,
                      neighborhood,city,state,country,postalCode}, daysSinceRegistration, daysSinceLastSell, daysSinceFirstSell }
                      (antifraud + subacquirer routing for Rede/Cielo/PagBank: docs\api_subacquirer-routing.md)
paymentItems.items[]{ detailUniqueID (unique within order), sku, ean, amount (double, PER UNIT), discountAmount, shippingAmount,
                      productID(int32), productDescription, categoryID, categoryName, itemQuantity(int16),
                      split{ merchantID, merchantDocument, merchantDocumentType, percent, amount }   <-- split (section 7)
                      antiFraud{...}, presentMessage }
paymentData         { paymentMethods[] (below), antiFraud{...}, deliveryAddress{street,number,complement,neighborhood,city,state,
                      country,postalCode,phone}, countrycode ("BR"), amount (double, order total), salesChannel,
                      callbackUrl  <-- per-payment webhook URL; overrides the account-level webhook (L1071-1074) }
frontData           { sessionID (antifraud fingerprint), ipAddress, acceptHeader, userAgent, cookiesAccepted, acceptLanguage,
                      colorDepth, screenHeight, ScreenWidth, TimeDifference, JavaEnabled, JavaScriptEnabled }  (3DS-recommended)
isMerchantInitiated bool
extraInfo           string
```
Extra fields seen in Tuna's samples but not in the schema: `paymentData.currency:"BRL"`, `istest`, `isfromfrontend`, `paymentMethods[].partneruniqueid`, `billinginfo.taxedamount/billedamount` (`docs\api_3ds-integration.md`, `docs\api_wallet-payments.md`). The .NET SDK model adds `PaymentData.SoftDescriptor`, `PaymentData.Interest`, `PaymentData.Origin`, `InitRequest.IsTest`, `Accumulate` and `SplitData.ShippingAmount` (`raw\github\dotnet\InitRequest.cs`).

**paymentMethods[] item** (L518-908):
```
paymentMethodType  char  see section 3 ("1" credit, "2" debit, "7" 3DS credit, "8" 3DS debit, "D" Pix, "3" boleto, "E" crypto)
amount             double
installments       int16
methodOption       string (Nupay/Koin only)
cardInfo { token, tokenProvider ("Tuna" | "GooglePay" | "ApplePay" | "networktoken" | other), cryptogram,
           networkTokenExpirationMonth/Year, cardHolderName, alias, expirationMonth(int16), expirationYear(int16, 4 digits),
           billingInfo{number,document,documentType,name,phone,address{...}}, externalProviderInfo, brandName (from Token API),
           tokenSingleUse (0 = saved card [default], 1 = single-use token), saveCard(bool), cardOnFile (MC CIT/MIT "01".."12") }
authenticationInformation { code, referenceId, transactionId }   <-- 3DS (section 5)
boletoInfo { expiration(date), billingInfo{...} }
customer { ... }
pix { name, document, documentType, expirationSeconds (int32, validity of the Pix code) }
softDescriptor string
```

### 2.2 Init examples (request bodies)

**Credit card with a Tuna token** (`docs\api_payment-integration.md` Step 3; spec example `InitRequestDummyCapturedCreditCard` L5921):
```json
{
  "tokenSession": "<sessionId>",
  "partnerUniqueId": "#000.001",
  "customer": {"id":"7","email":"maju@x.com","document":"744.479.870-23","documentType":"CPF","name":"Maju Cheapetta"},
  "paymentItems": {"items":[{"amount":20,"detailUniqueId":"A01","productDescription":"Test product","itemQuantity":1}]},
  "paymentData": {
    "paymentMethods":[{"paymentMethodType":"1","amount":20,"installments":1,
      "cardInfo":{"token":"ct_NjJm...","tokenProvider":"Tuna","cardHolderName":"Captured","expirationMonth":12,
                  "expirationYear":2023,"brandName":"Visa","tokenSingleUse":0,"saveCard":false,
                  "billingInfo":{"document":"744.479.870-23","documentType":"CPF"}}}],
    "deliveryAddress": {"street":"Rua João Longo","number":"1004","neighborhood":"Jandira","city":"São Paulo","state":"SP",
                        "postalCode":"06608-420","phone":"(11) 6536-8864","country":"BR"},
    "countryCode":"BR"
  }
}
```
**Pix** (spec `InitRequestPaymentPix` L4421; Postman "PIX / 1. Init with PIX" adds `ExpirationSeconds: 600`):
```json
{
  "partnerUniqueId":"#032",
  "customer":{"id":"7","email":"...","document":"744.479.870-23","documentType":"CPF","name":"Maju Cheapetta"},
  "paymentItems":{"items":[{"amount":20,"detailUniqueId":"A01","productDescription":"Test product","itemQuantity":1}]},
  "paymentData":{"paymentMethods":[{"paymentMethodType":"D","amount":20,
      "pix":{"name":"Maju Cheapetta","document":"744.479.870-23","documentType":"CPF","expirationSeconds":600}}],
    "countryCode":"BR"}
}
```
**Debit/credit with 3DS:** see section 5. **Google Pay / Apple Pay:** see section 6. **Split:** see section 7.

### 2.3 Init response, `InitResponseSchema` L1142-1510

```
status          char    overall PAYMENT status (section 3.1)
code            int32   1 = processed (also returned for declines). Negative = request error.
message         {source:int (1 Engine/2 AntiFraud/3 Gateway/4 Customization), code (deprecated string), message, info}
paymentKey      string  Tuna payment id (e.g. "13489AA00000BCA"). Store it.
partnerUniqueId string
operationId     string
methods[] {
  methodId        int16 (0..n, index inside the payment; needed for partial cancel/capture)
  methodType      char
  status          char  METHOD status (section 3.2)
  methodKey, operationId, statusAF (antifraud status)
  message {source, code ("GwResultOk", "GwNotAuthorized", "GwErrorTransaction", "GwErrorCard", "GwInvalidCardData", ...), message, info}
  acquirer[]  {name, status, message, serviceName, resultId, info, originalResponse, time, order}
  antifraud[] {name, status (A/U/R/I/E/C/Z), ...}
  antiFraudResults {name: result}
  additionalInfo {}           (webhook shows e.g. {"EndToEndId": "E6070..."} for Pix)
  redirectInfo {url}          (boleto URL; antifraud/biometric redirect)
  cardInfo {bin, authorizeNsu, transactionId, authorizeCode, last4, brandName}
  pixInfo  {qrContent, qrImage, qrCopyPaste}   (casing: see note)
  cryptoInfo {...}
  threeDSInfo {url, provider, token, paRequest}   NOT in OpenAPI. From .NET SDK InitResponse.cs + tuna.js (section 5)
}
```
**Pix response example** (spec `InitResponsePaymentPix` L6351):
```json
{"status":"P","methods":[{"message":{"source":3,"code":"GwResultOk","message":"Successfull authorization"},
  "acquirer":[{"name":"Tuna Split para PIX","status":"C","message":""}],
  "pixInfo":{"qrImage":"https://dev.tuna.uy/img/tuna-qr.png",
             "qrCopyPaste":"00020101021126580014br.gov.bcb.pix0136...6304 9479",
             "qrContent":"00020101021126580014br.gov.bcb.pix0136..."},
  "methodType":"D","status":"C","methodId":0,"operationId":"O000113489AA00000D1300","methodKey":"13489AA00000BCA00"}],
 "paymentKey":"13489AA00000BCA","partnerUniqueId":"#032","code":1,"operationId":"O000113489AA00000D13"}
```
- **Pix casing note:** the schema says `qRContent`/`qRImage`/`qrCopyPaste` (L1408-1419), but the examples say `qrContent`/`qrImage`/`qrCopyPaste`. The .NET SDK model has `QRContent, QRImage, QRCopyPaste, Txid, Expiration(int?)` (`raw\github\dotnet\InitResponse.cs`), and System.Text.Json camelCase turns those into `qrContent/qrImage/qrCopyPaste/txid/expiration`. **Match these keys case-insensitively.** `qrImage` may be a URL rather than base64. `txid`/`expiration` are SDK-only (UNCONFIRMED on the wire).
- An unpaid Pix comes back as overall `status:"P"` with method `status:"C"`. It moves to `"2"` when paid (webhook example, section 8).
- Card dummy outcomes (spec L6563-6690): Captured → overall `"2"`/method `"2"`. Authorized → `"P"`/`"1"`. Not Authorized → `"4"`/`"4"` (`GwNotAuthorized`). Error → `"4"`/`"A"`. Invalid → `"4"`/`"A"` (`GwErrorCard`). Pending → `"P"`/`"C"`. Expired → `"4"`/`"6"` (`GwInvalidCardData`).
- `antiFraud.data.returnOriginalResponse=true` adds raw acquirer/antifraud JSON (L1001-1010).

### 2.4 Status

Request (L2546): `{"paymentKey":"..."}` **or** `{"PartnerUniqueID":"...","paymentDate":"2022-03-26"}`. The date is mandatory when you query by order id. Optional `MessageDetails:true` adds `last4, holderName, authorizationCode, numberMasked, hasNetworkToken, originalResponse...`.

Response (L2769): `status` (char), `statusDescription` ("Captured", "Cancelled", "PartialRefunded", ...), `partnerUniqueId`, `amount`, `methods[]{statusDescription, methodType, status, methodId, amount, capturedAmount, balanceAmount, authorizerNsu, captureNsu, installments, transactionId, bin, brandName, subOrderId, seller, antiFraud[], acquirer[]}`, `items[]`, `code`. Example: `{"status":"9","statusDescription":"PartialRefunded","methods":[{"statusDescription":"PartialRefunded","methodType":"1","status":"9","methodId":0}],"code":1}` (L7030).

The spec recommends Status for reconciliation when callbacks are missed (L7905-7912).

### 2.5 Cancel = refund (total or partial)

`CancelRequestSchema` L1511:
```
paymentKey | (partnerUniqueID + paymentDate)
cardsDetail[] { amount (double), methodId (int16), Splits[] {MerchantID, Amount} (REQUIRED for partial refund of split payments), data{} }
paymentDate
PixInfo {PixKeyType, PixKey, Document, DocumentType}   (boleto refunds only, authorized customers)
```
Examples (L6796-6835):
- Total: `{"paymentKey":"13489A600000BA7"}`.
- By order: `{"partnerUniqueID":"#0002","paymentDate":"2022-03-26"}`.
- Partial: `{"cardsDetail":[{"amount":5,"methodId":0}],"paymentKey":"..."}`.
- Partial split: `{"cardsDetail":[{"amount":300.50,"methodId":0,"Splits":[{"MerchantID":"12345","Amount":100.50},{"MerchantID":"67890","Amount":200.00}]}],"paymentKey":"..."}`.
- Postman also sends `"CancelAll": false`.

Response: `{"status":"3","methods":[{"message":{...},"methodType":"1","status":"3","methodId":0,"operationId":"..."}],"code":1,"message":{"source":1,"code":"Done","message":"Operation terminated"},"operationId":"..."}`.

Possible async states: `D` PendingRefund and `G` PendingCancel (retried automatically). Error `-137` means the status is not cancellable. Pix refunds are supported (ReturnReceipt examples show `paymentMethodTypeId:"D"`).

**CancelItem** (L1736): `{"paymentKey":"...","itemsDetail":[{"itemQuantity":1,"detailUniqueId":"A01"}]}`.

**ReturnReceipt** (L4152): `{paymentKey}` or `{PartnerUniqueID, paymentDate}`. Returns `returnReceipts[]{returnValue, returnDate, partnerName, paymentMethodTypeId, paymentMethodTypeName, totalAmount, paymentDate, tunaId, partnerUniqueId}`, `code`.

### 2.6 Capture / AdvancedCapture

Used only if the account's flow is configured for delayed capture (L7817-7820). Body: `{"amount":double,"cardsDetail":[{"amount":double,"methodId":int}],"paymentKey":"...","partnerUniqueID":"...","paymentDate":"..."}`. Returns the Cancel response shape. AdvancedCapture has the same schema; it is **undocumented beyond the name**.

### 2.7 NotifyEvent (chargeback / delivery)

`{"eventName":"Chargeback"|"Delivery","EventDescription":"Fraud"|"Dissatisfaction"|<order id>,"cardsDetail":[{paymentKey|paymentPartnerUniqueID+paymentDate, methodId, eventDate}],"orderDetails":[{paymentKey..., eventDate, items[{detailUniqueID,itemQuantity,eventDate}]}]}`. Response: `{code, ordersNotFound[]}` (L1950-2057, L2578).

### 2.8 Create Payment Link (note only)

`/api/PaymentLink/Create` returns `paymentLink.url`, `expirationTimestamp`, `status`, `detail.paymentKey`, ... (L2663). The feature must be enabled by Tuna (`docs\console_paymentlink.md`: "not enabled by default ... golive@tuna.uy"). It is a hosted checkout, so it **does not meet the internal-checkout requirement**.

---

## 3. Status / Tuna codes (`docs\api_tuna-codes.md`, `codes\*.json`)

### 3.1 Payment status (overall `status` / webhook `statusId`)

| Code | Name | Meaning | Jurandir treatment |
|---|---|---|---|
| `0` | Started | nothing executed yet | pending |
| `2` | Captured | funds secured | **PAID (final-ok)** |
| `3` | Refunded | refunded | refunded (final) |
| `4` | Denied | denied by issuer/acquirer/antifraud | **failed (final)** |
| `5` | Cancelled | cancelled after authorization | failed/cancelled (final) |
| `6` | Abandoned | started too long ago, never evolved (e.g. expired Pix) | expired (final) |
| `7` | Chargeback | chargeback | chargeback |
| `8` | MoneyReceived | funds transferred to partner | **PAID** |
| `9` | PartialRefunded | partially refunded | partially refunded |
| `P` | Pending | waiting on another process (antifraud, Pix payment, 3DS) | pending |

tuna.js itself treats `["2","8"]` as approved and `["4","5","A","N"]` as failed in its status long-poll (`raw\tunajs\tuna-v2.js`, `doStatusLongPolling`: `i=["2","8"],o=["4","5","A","N"]`).

### 3.2 Payment **method** status (`methods[].status`)

Same as above plus: `1` Authorized (not captured), `A` Error, `B` RedFlag, `C` PendingCapture (also what an unpaid Pix shows), `D` PendingRefund, `G` PendingCancel, `N` NotProcessed (final).

### 3.3 Payment method types (`paymentMethodType`)

`1` CreditCard, `2` DebitCard, `3` Boleto, `4` BankTransfer, `9` External, `A` GiftCard, `B` Balance, `C` CreditCardPrivateBrand, `D` PIX, `E` Crypto, `F` Voucher, `7` ThreeDS20Credit, `8` ThreeDS20Debit.

---

## 4. Token API: client-side tokenization without secrets (`tuna-token.yaml`)

| Op | Path | Body | Auth |
|---|---|---|---|
| NewSession | `POST /api/Token/NewSession` | `{"customer":{"id","email"}}` (samples also send `Name`, `PaymentAccount`, `partneruniqueid`, `Is3dsTest:true`) | **app token, server only** |
| Generate | `POST /api/Token/Generate` | `{"sessionId","card":{"cardNumber","cardHolderName","expirationMonth","expirationYear","cvv","singleUse"},"authenticationInformation":{"code":"<sessionId>"}}` | **sessionId only** |
| List | `POST /api/Token/List` | `{"sessionId"}` → `tokens[]{token,brand,cardHolderName,expirationMonth,expirationYear,maskedNumber,singleUse,data}` | sessionId |
| Bind (CVV for a saved token) | `POST /api/Token/Bind` | `{"sessionId","token","cvv"}` → `{validFor,code,message:"Bind succeded"}` | sessionId |
| ValidateSession | `POST /api/Token/ValidateSession` | `{"sessionId"}` → `{partnerId, partnerUniqueId, accountIsolation, code}` | sessionId |
| Delete | **`DELETE`** `/api/Token/Delete` | `{"sessionId","token"}` | sessionId |
| Proxy (PCI vault forwarder) | `POST /api/Proxy` | headers `Tuna-AppToken`, `Tuna-Session`, `Tuna-Forward-To` | app token |

**Why the app needs no secret key:**
- The backend calls NewSession with the app token and returns only `sessionId` to the app. The app then POSTs the card **directly to Tuna** at `https://token.tunagateway.com/api/Token/Generate` with only the sessionId.
- Evidence:
  - `docs\api_3ds-integration.md`: "Always create sessions from your backend — never expose your apptoken" and "Token/Generate ... must be called from the browser (frontend JS), not from your backend server, unless your company holds PCI DSS Level 1".
  - `docs\api_pci-vault.md`: "The customer device tokenizes card data directly with Tuna."
  - `docs\plugins_javascript.md`: "The sessionID is the public key".
  - [CODE] tuna-v2.js Generate sends only `Content-type` (no app token), body `{SessionId, card, authenticationInformation:{code:sessionID}, addToNetworkToken:true}`. The React Native SDK `src/api/tunaApi.ts` does the same with plain `fetch`.
  - [LIVE] prod `Token/Generate` with no auth headers and a bogus session returns `"Session object is invalid"` (not "AppToken is required"). CORS preflight returns `Access-Control-Allow-Origin: *` with allowed headers `x-tuna-token-session, Content-Type, ...`, and `x-tuna-apptoken` is **not** among them.
- **Flutter conclusion:** a plain `http.post` to `/api/Token/Generate` with the sessionId works. No SDK is needed and no secret ships in the app. Card data goes **straight to Tuna**, never to our backend.

**Generate response** (prod, `[LIVE]` keys): `{token, hasNetworkToken, isVoucher, brand, validFor, bin, networkTokenResponse, authenticationInformation, code, message}`.
- `token` looks like `ct_...` (or a UUID in the 3DS docs).
- `brand` is something like "Visa"; pass it as `cardInfo.brandName`.
- `validFor` is the **CVV retention TTL in seconds** (spec L221-228). The 3DS doc example shows `900`.
- `authenticationInformation` is filled when 3DS applies (section 5).

**TTLs:**
- CVV: `validFor` seconds (example 900).
- Session TTL: **not documented** (UNCONFIRMED). Token errors include "Session has expired" and "User has reached maximum number of sessions allowed". The RN SDK uses a 30-min client default, which is not authoritative.
- Single-use tokens: `singleUse:true` at Generate and `tokenSingleUse:1` at Init.

Other app-callable endpoints seen in tuna.js (not in OpenAPI, UNCONFIRMED):
- `POST https://token.tunagateway.com/api/integrations/plugin/{Init,StatusPoll,ListAntifrauds}` with header `x-tuna-token-session: <sessionId>`. StatusPoll body: `{MethodID, PaymentStatusList, PaymentKey}`. It returns `{paymentMethodConfimed, paymentStatusFound, allowRetry}` and is used by tuna.js for Pix/3DS polling. [LIVE] sandbox returned 404 for StatusPoll.
- `POST https://token.tunagateway.com/api/ApplePayToken/Session` (Apple Pay web merchant validation, section 6).
- Prefer our backend's `/api/Payment/Status` for polling.

---

## 5. 3DS (credit `7` / debit `8`): `docs\api_3ds-integration.md` + [CODE]

- Tuna runs its own MPI (Cybersource/Cardinal Cruise). Whether 3DS applies is decided by the account's **flow in Console**, not by the API caller.
- Sandbox: NewSession with `"Is3dsTest": true` (remove it in prod).

**Flow (backend Init mode, "Mode 4: manual tokenization"):**

1. **Backend:** `NewSession` → `sessionId`.
2. **App/browser:** `Token/Generate` with `authenticationInformation:{code: sessionId}`. The response contains `authenticationInformation{accessToken, deviceDataCollectionUrl, referenceId, transactionId}` (field names from `raw\github\3ds\TokenWithPureJS-InitWithPostman_script.js`, RN `TokenResponse`, and .NET `SetupPayerInfo{AccessToken, deviceDataCollectionUrl, referenceId, token, transactionId, paymentMethodIdentifier}`).
3. **Device data collection:** in a hidden iframe/WebView, POST a form to `deviceDataCollectionUrl` with hidden field **`JWT` = accessToken**. Wait for `window.postMessage` from origin `https://centinelapi.cardinalcommerce.com` (or `centinelapistag...`) with `{"Status":true}` (3DSSamples script L≈160-175; tuna.js `threedsdatacollectionframe`).
4. **Backend:** Init with `paymentMethodType:"8"` (debit) or `"7"` (credit) plus:
   ```json
   "cardinfo":{"token":"<token>","tokenprovider":"Tuna","savecard":false},
   "AuthenticationInformation":{"Code":"<sessionId>","ReferenceId":"<referenceId>","TransactionId":"<transactionId>"}
   ```
   plus `frontData` (`userAgent, ipAddress, acceptHeader, acceptLanguage, colorDepth, screenHeight, screenWidth, timeDifference, javaEnabled, javaScriptEnabled`; strongly recommended).
5. **If a challenge is needed:** the Init response has `methods[0].status` in `["0","P"]` **and** `methods[0].threeDSInfo = {url, token, paRequest, provider}` (tuna.js: `["0","P"].includes(p.status)&&p.threeDSInfo`).
   - Render a form POST in a WebView/iframe to **`threeDSInfo.url`** with hidden field **`JWT` = `threeDSInfo.token`**.
   - Size the frame from `JSON.parse(base64decode(paRequest)).challengeWindowSize`: `01`=250x400, `02`=390x400, `03`=500x600, `04`=600x400, else full screen.
   - Then **poll Status** (or wait for the webhook). There is no "complete 3DS" API call; Tuna finishes the auth after the ACS step-up.
6. Frictionless cards return the final status straight from Init.

Mobile:
- The RN SDK opens the challenge either in a WebView or in the system browser via Tuna's landing page `https://threedslanding-28449915088.europe-west1.run.app?challengeUrl=..&pareq=<token>&termUrl=..&md=<paRequest>&deepLink=myapp://...` (`raw\github\rn\src_core_ThreeDSHandler.ts`, `src_constants_config.ts`). That landing page is UNCONFIRMED as an official contract.
- A WebView with the HTML form above is the robust option for Flutter.

**Test cards** (sandbox/homolog; Cybersource): expiry 01/(current year+3), any CVV. Visa:
- `4000000000002701` frictionless OK (ECI 05)
- `4000000000004574` frictionless fail
- `4000000000002719` attempted
- `4000000000002313` unavailable
- `4000000000002537` rejected
- `4000000000002503` **challenge success**
- `4000000000004293` challenge fail

Mastercard: `5200000000002235` OK, `5200000000002151` challenge OK. Elo: `6505290000002000` OK, `6505290000002190` challenge OK. Full table in `docs\api_3ds-integration.md`.

**Debit method code ambiguity:** the 3DS guide and Postman use `"8"` (ThreeDS20Debit) for debit, but Tuna's `3DSSamples/NodeApp/index.js` sends `"paymentmethodtype":"2"` with `AuthenticationInformation`. Debit **without** 3DS is not described anywhere. **Confirm with Tuna** which code their flow expects.

---

## 6. Wallets: `docs\api_wallet-payments.md`, `docs\services_googlepay.md`, [CODE]

Both wallets go through Init as a card payment: `paymentMethodType:"1"` (installments allowed) with
`cardInfo.tokenProvider:"GooglePay"|"ApplePay"` and `cardInfo.token` = **the raw wallet token string, unparsed**. A `TokenSession` (NewSession) is still sent. Spec examples: `InitRequestGooglePay` L5739 and `InitRequestApplePay` L5782.
```json
"paymentData":{"paymentMethods":[{"paymentMethodType":"1","amount":150,"installments":1,
  "cardInfo":{"tokenProvider":"GooglePay","token":"{\"signature\":\"...\",\"intermediateSigningKey\":{...},\"protocolVersion\":\"ECv2\",\"signedMessage\":\"{...}\"}","saveCard":false}}],
 "countryCode":"BR","amount":150}
```

**Google Pay**
- Token source: `paymentData.paymentMethodData.tokenizationData.token`.
- Tokenization: `type: PAYMENT_GATEWAY`, `gateway: "tuna"`.
  - Lowercase in the current guide, in tuna.js `GOOGLE_PAY_GATEWAY:"tuna"`, and in the RN SDK.
  - The legacy PT page `services_googlepay.md` writes `"Tuna"`. Google gateway ids are lowercase, so use `tuna`.
- `gatewayMerchantId`:
  - The guide says `"YOUR_TUNA_MERCHANT_ID"` without defining it.
  - **tuna.js hardcodes `GOOGLE_PAY_GATEWAY_MERCHANT_ID:"78c30483-2a55-422e-98f1-b68f77fcaa70"` for both prod and sandbox** (`raw\tunajs\tuna-v2.js`, env config).
  - tuna.js docs also mention Google `merchantId 'BCR2DN6TR7QYLIKK'` for "Tuna's merchant" (`plugins_javascript.md` "useGooglePay").
  - **Ask Tuna** whether we use our own id (account name? partner id?) or theirs.
- Networks: `VISA, MASTERCARD, AMEX, DISCOVER, JCB`. Auth methods: `PAN_ONLY, CRYPTOGRAM_3DS`. Use `ENVIRONMENT_TEST` while testing.
- Alternative legacy path: `POST /api/GooglePayToken/Validate {SessionId, PayLoad}` returns a Tuna token (`services_googlepay.md`). It is not in OpenAPI (UNCONFIRMED).

**Apple Pay**
- Token: `JSON.stringify(payment.token.paymentData)` → `tokenProvider:"ApplePay"`.
- "Tuna handles merchant session validation on its end. You only need to register your domain and merchant identifier in Apple Pay console. Contact your Account Manager for Tuna's payment processing certificate configuration." Since Tuna receives the encrypted `paymentData`, **Tuna must hold the private key of the Payment Processing Certificate**. Flow: Tuna supplies the CSR, or you use Tuna's merchant id. **UNCONFIRMED which; ask Tuna.**
- tuna.js mentions `merchantId 'merchant.uy.tunahmlg'` "for use Tuna's merchantId" (homolog).
- Web merchant validation: tuna.js calls `POST https://token.tunagateway.com/api/ApplePayToken/Session` with `{sessionId, displayName, domain, useMassMerchant, merchantId}` and gets back `{data: merchantSession}`.
- Native iOS (PassKit) needs no merchant validation, only the processing certificate.
- Supported networks per tuna.js: `VISA, MASTERCARD, AMEX, DISCOVER, JCB` (RN adds elo/hipercard).

The response example in the wallet guide (`paymentStatus`, `paymentMethods[]`) **does not match** the Init response schema. Treat it as illustrative and parse the standard Init response.

---

## 7. Split / marketplace (`docs\api_split-integration.md`, `tuna-merchant.yaml`)

- The split guide **is published** (no longer "Coming soon").
- Split providers: "Tuna Split para Cartão" (service ids 41, 63) and "Tuna Split para PIX" (69, 71, 86, 88, 93, 101). They support **card, Pix, boleto, Nupay**.
- **Fees / payment plans:** configured **commercially by Tuna** as a "Payment Condition", each with:
  - frequency (daily/weekly/monthly)
  - days to release after capture
  - fee (fixed or %, per method/brand)

  The merchant references it with `condition` (string key). There is **no API to set fees**. Payout fees are visible in `GetMerchantSummary` (`PayoutFee`, `PayoutFeeWithdraw`, `PayoutFeeWeekend`).

**Register a sub-merchant (bar):** `POST {engine}/api/Merchant/Register` (`RegisterRequestSchema` L122-393):
```
externalId (YOUR merchant id), document, documentType ("CNPJ"|"CPF"), name (razão social), fantasyName, countryId (1),
statusId ("0".."3"), mccCode (e.g. "5812" restaurants), registrationDate, condition, websiteUrl, stateFiscalDocument ("ISENTO"|IE),
acceptedContract (bool), marketplaceStore, multiStore, birthday (PF), occupation (PF), motherName (PF),
pixKeyType ("1" CPF, "2" CNPJ, "3" Email, "4" Cellphone, "5" Random, "6" Bank Account), pixKey (must belong to same document),
contact{name,email,phone,cellPhone}, legalRepresentative{name,document,birthday},
bankAccounts[]{externalId, document, documentType, accountType ("C"|"S"), bankCode, agency, number ("0733-7"), bankName},
address{street,number,complement,neighborhood,city,state,postalCode,phone}
```
- Minimal PJ example: `docs\api_split-integration.md` "API Requests".
- Response: `{"merchantId":86,"code":1,"message":{"source":0,"message":"New merchant has been created"}}`.
- Validation errors: `-124..-189` (tuna-codes "Merchant API").
- Registration is **asynchronous (up to 48 h)**. The final result per split provider arrives on the **merchant webhook** (section 8.2). KYC level `0` means Pix only, limited.

Other Merchant endpoints: `GetMerchant {merchantID: externalId}`, `GetMerchantSummary {ExternalId}`, `FlagsChange {ExternalId, AutomaticPayOnWeekend}`, `GetMerchantList`, `Transactions`, `Statement`, `GetScheduleList`, `ConsolidatedStatement` (spec L2728-3150).

**Split at Init:**
- Per item, `paymentItems.items[].split = {"merchantId": "<externalId>"}`.
- Optional overrides: `percent` or `amount` per item (each overrides the default split rules), plus `merchantDocument/merchantDocumentType`. The .NET SDK adds `shippingAmount`.
- The id is the `externalId` you registered. Inferred from `GetMerchant` examples using `merchantID:'##001'` = the registered `externalId:'##001'`; the Split guide calls it "Your unique ID for the merchant".
- For a single-bar order, put the same `split.merchantId` on every item.
- The remainder (after merchant share and fees) stays with the marketplace account. **The exact settlement math is UNCONFIRMED.**
- Partial refunds of split payments **require** `cardsDetail[].Splits[]{MerchantID, Amount}`.

---

## 8. Webhooks (`docs\api_webhooks-notifications.md`, `docs\console_account.md#webhook`)

There are **two independent endpoints, configured in Console > Settings > Webhook**, each with its own URL and optional auth. There is no API to register them, but **`paymentData.callbackUrl` in Init overrides the payment webhook URL per payment** (spec L1071-1074).

### 8.1 Payment webhook

Events are selected in Console: `Init`, `Capture`, `Cancel`, `Chargeback`. Payload (Pix paid example):
```json
{
  "id": 104574372,
  "paymentKey": "134D946015A08C9",
  "partnerUniqueId": "668ecbaff060e8001162eef6",
  "statusId": "2",
  "amount": 19.50,
  "operationId": "O005B134D946015E4CF0",
  "methods": [{"methodType":"D","status":"2","methodId":0,"operationId":"O005B134D946015E4CF000",
               "additionalInfo":{"EndToEndId":"E60701190202407101759DY5BQ4HFISM"},"operationAmount":19.50}],
  "items": [{"paymentItemId":0,"productID":1,"productDescription":"841","amount":19.5,"quantity":1,"categoryID":1,
             "categoryName":"Pedido","data":{"DetailUniqueID":"...","ExternalMerchantId":"65677b704f42a50019188852", "...":"..."}}]
}
```
`id` = notification id. `statusId` = payment status (section 3.1). There is no event-type field: infer the event from `statusId` and method status.

### 8.2 Merchant webhook (registration + payout)

Envelope:
`{merchantId:int, code:1|-1, message{source, code, message, info?}, externalId, serviceId, serviceName, conditionId?, minDelayDays?, merchantStatusId?, kycLevel?}`
- `message.code`:
  - `SRVMerchantRegisterOk` / `SRVMerchantRegisterRejected` / `SRVMerchantRegisterError` / `SRVMerchantRegisterBlocked`
  - payout: `SRVMerchantPaymentOk` (`serviceId:0`, `serviceName:"SYSTEM"`) and `SRVMerchantPaymenError` (the typo is part of the contract)
- `merchantStatusId`: `0` InAnalysis, `1` Active, `2` Inactive, `3` Suspended, `P` PreRegister.
- `kycLevel`: `0`/null analysis, `1` approved, `A` approved w/ alert, `P` PEP, `R` rejected.
- One notification is sent **per split provider**.
- Note: the guide's "Error" example has `code:1` with `SRVMerchantRegisterError`, so key off `message.code`, not `code`.

### 8.3 Authenticity, delivery, response

- **No signature/HMAC is documented.** The only mechanism is an optional authorization value configured per webhook in Console. Tuna sends it "either as a Bearer token in the `Authorization` header or as the value of a custom header". The guide says: "validate the appropriate header before processing the body".
- **Recommended:** configure a long random Bearer secret, compare it in constant time, and **re-fetch `/api/Payment/Status` by paymentKey before marking an order paid** (the payload is not otherwise verifiable).
- **Success responses:** HTTP `200, 201, 202, 204, 208`.
- **Retries:** "A notification has a delivery retry lifecycle", so handle duplicates idempotently (key on `id` and/or `paymentKey`+`statusId`). **Retry count, backoff and timeout are not documented (UNCONFIRMED).**
- Use HTTPS. Do not log credentials or complete customer data.

---

## 9. Idempotency (`docs\api_idempotent-requests.md`)

- Header: **`Idempotency-Key: <unique string>`** (UUID v4 suggested), accepted on **all POST** requests. GET/DELETE ignore it.
- Tuna stores the status code and body of the first request that **started executing** and replays it for retries with the same key, **including 500s**. Validation failures and concurrent conflicts are not stored and are safe to retry.
- Keys can be purged after **≥24 h**; a key reused after purge creates a new request.
- Params are compared to the original, and a mismatch errors.
- Independently, `partnerUniqueID` is unique per account: a re-sent Init with the same id gets `code -108` "Partner Unique ID already used".

**Recommended:**
- Use `Idempotency-Key = <attempt uuid>` on Init/Cancel.
- Use `partnerUniqueID = <orderId>[-<attempt>]`.
- On timeout, reconcile via `Status` (by `paymentKey`, or by `PartnerUniqueID` + `paymentDate`).

---

## 10. Sandbox test data (`docs\api_sandbox-environment.md`, spec Dummy examples L5921-6235)

**Dummy connection (homolog account).** Card `4111111111111111` or `5555555555554444`, and the **cardholder name drives the result**:

| Holder name | Result |
|---|---|
| `Authorized` | authorized (method `1`, overall `P`) |
| `Captured` | captured (`2`) |
| `Not Authorized` | denied (`4`) |
| `Error` | transaction error (`4` / method `A`) |
| `Invalid` | configuration error |
| `Pending` | capture pending (`P` / method `C`) |
| `Expired` | expired (`4` / method `6`) |

- 3DS cards: section 5 (Cybersource set; NewSession `Is3dsTest:true`).
- **Pix simulation:** the Dummy connection "mocks ... PIX" (`console_account.md`), but **how to mark a homolog Pix as paid (simulate the payment) is not documented (UNCONFIRMED).** Ask Tuna. Their console may have a manual action.
- Public `demo` keys are dead ([LIVE], section 1).

---

## 11. Minimal implementation checklist (derived)

1. Env: `TUNA_ACCOUNT`, `TUNA_APPTOKEN`, `TUNA_ENGINE_URL` (`https://engine.tunagateway.com`), `TUNA_TOKEN_URL` (`https://token.tunagateway.com`), `TUNA_WEBHOOK_SECRET` (Bearer set in Console).
2. `POST /api/tuna/session` (backend) → Token/NewSession (`customer{id,email}`) → return `sessionId` to the app.
3. App → `POST {TOKEN_URL}/api/Token/Generate` with `{sessionId, card{...}, authenticationInformation:{code:sessionId}}`.
   - For 3DS, run DDC in a WebView with `JWT=accessToken`.
   - Send `{token, brand, referenceId, transactionId}` to our backend.
4. Backend → `/api/Payment/Init`:
   - card `1` / 3DS credit `7` / 3DS debit `8` (confirm), Pix `D` (with `pix.expirationSeconds`), wallets `1` + `tokenProvider`
   - per-item `split.merchantId = bar.tunaExternalId`, `paymentData.callbackUrl`, and the `Idempotency-Key` header.
5. Interpret the response:
   - `code<0` → error.
   - overall `2`/`8` → paid.
   - `4`/`5`/`6` → failed.
   - `P`/`0` → pending: show the Pix QR from `methods[].pixInfo.qrCopyPaste/qrContent`, or open the 3DS challenge if `threeDSInfo` is present.
6. Webhook: check the Bearer, re-query Status, update the order idempotently, return 200 quickly. Add a reconciliation job that polls `Status` for pending orders.
7. Refund: `/api/Payment/Cancel` (`cardsDetail[{amount,methodId,Splits[...]}]` for partial).

---

## 12. Live probes performed (2026-10-26; NewSession/Generate/Pix request+response files are in `tuna\sandbox\`, the rest are recorded only in this table)

| Call | Result |
|---|---|
| sandbox `token.tuna-demo.uy/api/Token/NewSession` with demo keys (several payloads) | `200 {"sessionId":null,"code":-1,"message":"An exception has occurred while processing the request."}` |
| sandbox `Token/Generate`, no auth, invalid session | `200 {"code":-1,"message":"Session object is invalid"}` |
| sandbox `sandbox.tuna-demo.uy/api/Payment/Init` (Pix) with demo keys | `200 {"code":-113,"message":{"source":1,"code":"SRVPartnerAutErr"}}` |
| sandbox `Payment/Init` with malformed amount | `400` problem JSON (System.Text.Json error) |
| prod `engine.tunagateway.com/api/Payment/Status`, no creds | `200 {"code":-111,..."SRVNoPartnerToken"...}` |
| prod `token.tunagateway.com/api/Token/NewSession`, no creds | `200 {"code":-1,"message":"AppToken is required"}` |
| prod `Token/Generate`, no creds, bogus session | `200 {... "message":"Session object is invalid"}` (no app token required) |
| prod `OPTIONS Token/Generate` | `204`, `Access-Control-Allow-Origin: *`, allow-headers include `x-tuna-token-session`, `Content-Type` |
| sandbox `integrations/plugin/StatusPoll` | `404 page not found` |

No real payment, card or customer data was sent anywhere.

---

## 13. Open questions / not confirmed

1. **Test credentials:** the public `demo` sandbox keys fail. We need the `-homolog` account's `x-tuna-account`/`x-tuna-apptoken`, and to know which host it uses (Tuna's own tooling uses the prod hosts).
2. **Webhook security and retries:** there is no HMAC/signature, only an optional Bearer/custom header. The retry schedule, timeout and ordering are undocumented.
3. **Token session TTL:** undocumented. `validFor` (≈900 s in an example) is the CVV TTL only.
4. **Pix:** the default expiration when `expirationSeconds` is omitted, the exact response keys (`qrContent` vs `qRContent`; `txid`/`expiration` exist only in the SDK model), and how to simulate a paid Pix in homolog are all unknown.
5. **Debit:** `paymentMethodType` `"8"` (guide) vs `"2"` (Tuna sample). Whether debit is possible without 3DS. Which acquirer handles debit is set by the account flow.
6. **Google Pay `gatewayMerchantId`:** the guide placeholder vs the value `78c30483-2a55-422e-98f1-b68f77fcaa70` hardcoded in tuna.js. The gateway id `tuna` is confirmed by code and the current docs.
7. **Apple Pay:** who generates the Payment Processing Certificate (Tuna CSR vs Tuna's merchant id `merchant.uy.tunahmlg`), and the native in-app setup. Web merchant validation endpoint: `/api/ApplePayToken/Session` (code only).
8. **Split:** exact settlement math, whether the `split.merchantId` key is `externalId` (strongly implied) or `merchantId` (int), and that fees/conditions are only configurable by Tuna's commercial team.
9. **AdvancedCapture** semantics and the undocumented endpoints (`integrations/plugin/*`, `GooglePayToken/Validate`, `OrderDetails`, `RefundsOrderDetails`).
10. The wallet guide's response example uses a shape that differs from the Init schema.
