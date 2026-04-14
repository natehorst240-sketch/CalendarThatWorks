# Filtering System

## Overview

WorksCalendar uses a schema-driven filtering system.

---

## Defining filters

```js
const filterSchema = [
  { key: 'owner', type: 'select' },
  { key: 'priority', type: 'multi-select' },
  { key: 'status', type: 'select' },
  { key: 'dueDate', type: 'date-range' }
];
```

---

## Supported types

- select
- multi-select
- boolean
- date-range
- text

---

## Saved views

- save any filter combination
- switch instantly
- persist per calendar instance

---

## Goal

Turn one dataset into unlimited views.
