import { App, Editor, MarkdownView, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import * as dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const ORG_ID = process.env.ORG_ID || '';
const PROJECT_ID = process.env.PROJECT_ID || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

interface MyPluginSettings {}

const DEFAULT_SETTINGS: MyPluginSettings = {};

export default class UncoverPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		// This adds a command to uncover relationships between notes
		this.addCommand({
			id: 'uncover',
			name: '/uncover - Uncover Relationships',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const currentFilePath = view.file?.path;
				if (!currentFilePath) {
					editor.replaceSelection('Could not determine the current file path.');
					return;
				}

				const folderPath = currentFilePath.substring(0, currentFilePath.lastIndexOf('/'));
				console.log(`Searching in folder: ${folderPath}`); // Debug log
				const relatedNotes = await this.getNotesWithTag('&uncover', folderPath);

				if (relatedNotes.length === 0) {
					editor.replaceSelection('No related notes with the &uncover tag found.');
					return;
				}

				const relationships = await this.generateContent(relatedNotes);
				editor.replaceSelection(`\n## Relationships Uncovered:\n${relationships}`);
			}
		});
	}

	onunload() {
		console.log('Uncover plugin unloaded');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Fetches notes with the specified tag under a folder.
	 */
	async getNotesWithTag(tag: string, folderPath: string): Promise<string[]> {
		const notes: string[] = [];
		const files = this.app.vault.getFiles();

		for (const file of files) {
			if (file.path.startsWith(folderPath)) {
				try {
					const content = await this.app.vault.read(file);
					console.log(`Processing file: ${file.path}`); // Debug log
					console.log(`File content: ${content}`); // Log file content
					if (content.includes(tag)) {
						console.log(`File contains tag: ${file.path}`); // Debug log
						notes.push(file.path);
					}
				} catch (error) {
					console.error(`Error reading file: ${file.path}`, error);
				}
			}
		}

		return notes;
	}

	/**
	 * Uses OpenAI's chat completions API to uncover relationships between notes.
	 */
	async generateContent(notes: string[]): Promise<string> {
		if (!OPENAI_API_KEY) {
			return 'API Key is not set. Please configure it in the .env file.';
		}

		const notesContent = await Promise.all(
			notes.map(async notePath => {
				const file = this.app.vault.getAbstractFileByPath(notePath);
				if (file && file instanceof TFile) {
					return this.app.vault.read(file);
				}
				console.error(`File not found or not a valid TFile: ${notePath}`);
				return ''; // Return empty string if invalid
			})
		);

		const prompt = `Uncover relationships between the following notes:\n${notesContent.join('\n')}`;

		const openai = new OpenAI({
			organization: ORG_ID,
			project: PROJECT_ID,
			apiKey: OPENAI_API_KEY
		});

		try {
			const response = await openai.chat.completions.create({
				model: 'gpt-4o-mini',
				messages: [
					{ role: 'user', content: prompt },
				],
			});
			const messageContent = response.choices[0]?.message?.content;
			if (!messageContent) {
				console.error('No content returned from OpenAI API.');
				return 'Error generating content. No response content.';
			}
			return messageContent;
		} catch (error) {
			console.error('Error calling OpenAI API:', error);
			return 'Error generating content. Please check the console for details.';
		}
	}
}
