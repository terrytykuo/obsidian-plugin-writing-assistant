import { App, Editor, MarkdownView, Plugin, PluginSettingTab, Setting } from 'obsidian';
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
			id: 'uncover-relationships',
			name: 'Uncover Relationships',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const currentFilePath = view.file.path;
				const folderPath = currentFilePath.substring(0, currentFilePath.lastIndexOf('/'));
				const relatedNotes = this.getNotesWithTag('#uncover', folderPath);

				if (relatedNotes.length === 0) {
					editor.replaceSelection('No related notes with the #uncover tag found.');
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
	getNotesWithTag(tag: string, folderPath: string): string[] {
		const notes: string[] = [];
		this.app.vault.getFiles().forEach(file => {
			if (file.path.startsWith(folderPath)) {
				this.app.vault.read(file).then(content => {
					if (content.includes(tag)) {
						notes.push(file.path);
					}
				});
			}
		});
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
			notes.map(notePath => this.app.vault.read(this.app.vault.getAbstractFileByPath(notePath)))
		);

		const prompt = `Uncover relationships between the following notes:\n${notesContent.join('\n')}`;

		const openai = new OpenAI({
			organization: ORG_ID,
			project: PROJECT_ID,
		});

		try {
			const response = await openai.chat.completions.create({
				model: 'gpt-4o-mini',
				messages: [
					{ role: 'user', content: prompt },
				],
			});
			return response.choices[0].message.content;
		} catch (error) {
			console.error('Error calling OpenAI API:', error);
			return 'Error generating content. Please check the console for details.';
		}
	}
}
