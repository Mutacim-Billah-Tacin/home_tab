/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Task {
  id?: string;
  text: string;
  completed: boolean;
  category?: string;
  userId?: string;
  createdAt?: any;
}

export interface Note {
  id?: string;
  content: string;
  userId?: string;
  updatedAt?: any;
}

export interface Bookmark {
  id?: string;
  title: string;
  url: string;
  icon?: string;
  category?: string;
  userId?: string;
  createdAt?: any;
}

export interface Category {
  id?: string;
  name: string;
  userId: string;
  createdAt?: any;
}

export interface Alarm {
  id?: string;
  time: string; // HH:mm
  label: string;
  enabled: boolean;
  userId: string;
  createdAt?: any;
}

export interface WeatherData {
  temp: number;
  condition: string;
  location: string;
  high: number;
  low: number;
}
