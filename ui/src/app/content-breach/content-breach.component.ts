import { Component, OnInit, Input } from '@angular/core';
import { FormControl } from "@angular/forms";
import { LoaderService } from '../loader.service';
import {Router} from '@angular/router';

@Component({
  selector: 'app-content-breach',
  templateUrl: './content-breach.component.html',
  styleUrls: ['./content-breach.component.css']
})
export class ContentBreachComponent implements OnInit {

	@Input() stage: number;
	max: number = 4 + 2; // +2 for the intial and final text fields
	preResponse: string;
	postResponse: string;

	constructor(
		private loader: LoaderService,
		private router: Router
	) { }

	ngOnInit() {
	}

	prev() { if (this.stage > 1) { this.stage--; } }

	next() {
		if (this.stage < this.max) { this.stage++; }
		else {
			this.loader.setContent('breach', this.preResponse, this.postResponse)
				.then((x) => this.router.navigate(['/timeseries']));
		}
	}
}