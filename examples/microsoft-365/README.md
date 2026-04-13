# Microsoft 365 external form example

This example shows how to pair `CalendarExternalForm` with a Microsoft Graph adapter.

## Why this lives here

- Keeps MSAL / Graph auth choices out of the core `works-calendar` package.
- Reuses the same backend-agnostic submit contract as any other adapter.

## Adapter contract

Your adapter only needs:

```js
{
  async submitEvent(payload) => result
}
```

## Token provider

Pass a `tokenProvider` function that returns an access token. You can implement it with:

- `@azure/msal-browser`
- `@azure/msal-react`
- your own backend token exchange

Then render:

```jsx
<Microsoft365ExternalFormExample tokenProvider={getToken} />
```
