// Controlled React fields, as chat UIs build them: the DOM value comes from state, so a value
// React did not see through onChange is reverted on the next render.
import { type ChangeEvent, createElement, Fragment, useState } from 'react';
import { createRoot } from 'react-dom/client';

function ControlledFields() {
  const [area, setArea] = useState('');
  const [line, setLine] = useState('');
  return createElement(
    Fragment,
    null,
    createElement('textarea', {
      id: 'area',
      value: area,
      onChange: (event: ChangeEvent<HTMLTextAreaElement>) => {
        setArea(event.target.value);
      },
    }),
    createElement('input', {
      id: 'line',
      type: 'text',
      value: line,
      onChange: (event: ChangeEvent<HTMLInputElement>) => {
        setLine(event.target.value);
      },
    }),
    createElement('pre', { id: 'area-state' }, area),
    createElement('pre', { id: 'line-state' }, line),
  );
}

const container = document.getElementById('root');
if (container) createRoot(container).render(createElement(ControlledFields));
