import { describe, expect, it } from 'vitest';
import type { ConversationSummary } from '../types';
import { conversationValues, extractVariables, humanList, parseSegments, resolveTemplate, toPlainText, unknownVariables, variableProblems } from './templateVars';

describe('template variables', () => {
  it('parses text and variable segments', () => {
    expect(parseSegments('Hi {{user_name}}! Welcome to {{ company_name }}.')).toEqual([
      { type: 'text', value: 'Hi ' },
      { type: 'var', key: 'user_name', raw: '{{user_name}}' },
      { type: 'text', value: '! Welcome to ' },
      { type: 'var', key: 'company_name', raw: '{{ company_name }}' },
      { type: 'text', value: '.' },
    ]);
  });

  it('resolves known values and reports missing ones', () => {
    const r = resolveTemplate('Hi {{user_name}}, update by {{follow_up_time}} on {{case_id}}', { user_name: 'Elena', case_id: '#84291' });
    expect(r.text).toBe('Hi Elena, update by {{follow_up_time}} on #84291');
    expect(r.resolved).toEqual(['user_name', 'case_id']);
    expect(r.missing).toEqual(['follow_up_time']);
  });

  it('treats blank values as missing', () => {
    expect(resolveTemplate('{{order_id}}', { order_id: '  ' }).missing).toEqual(['order_id']);
  });

  it('derives values from a conversation', () => {
    const conv = { caseNumber: '84291', orderId: 'ORD-1', refundAmount: 8420, customer: { name: 'Elena Vasquez' } } as unknown as ConversationSummary;
    const v = conversationValues(conv, 'Neha Prasad');
    expect(v.user_name).toBe('Elena');
    expect(v.case_id).toBe('#84291');
    expect(v.refund_amount).toBe('₹8,420');
    expect(v.delivery_date).toBeUndefined();
  });

  it('flags malformed and unknown variables', () => {
    expect(variableProblems('Hi {{User Name}}')).toHaveLength(1);
    expect(variableProblems('Hi {{user_name}')).toHaveLength(1);
    expect(variableProblems('Hi {{user_name}}')).toHaveLength(0);
    expect(unknownVariables('{{user_name}} {{pet_name}}')).toEqual(['pet_name']);
    expect(extractVariables('{{a_b}} {{a_b}}')).toEqual(['a_b']);
  });

  it('formats summaries and strips light markdown', () => {
    expect(humanList(['user_name', 'company_name'])).toBe('Customer first name and company name');
    expect(toPlainText('**Welcome, Avery**\nThanks *a lot*')).toBe('Welcome, Avery\nThanks a lot');
  });
});
