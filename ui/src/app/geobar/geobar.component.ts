
import { Component, Input, OnChanges, SimpleChanges, ElementRef, AfterViewInit, ViewEncapsulation, HostListener, NgZone } from '@angular/core';
import { LoaderService, CompanyInfo, CompanyDB, APIAppInfo } from '../loader.service';
import * as d3 from 'd3';
import * as _ from 'lodash';
import { FocusService } from 'app/focus.service';
import { HoverService} from "app/hover.service";
import { Http, HttpModule} from '@angular/http';
import { Observable } from 'rxjs';
import { Subscription } from 'rxjs';
import { DeviceImpact, GeoData } from '../loader.service';

@Component({
  	selector: 'app-geobar',
	templateUrl: './geobar.component.html',
	styleUrls: ['./geobar.component.scss'],
	encapsulation: ViewEncapsulation.None
})

export class GeobarComponent implements AfterViewInit, OnChanges {

	// still in use!
  	companyid2info: CompanyDB;

  	@Input() impactChanges : Observable<any>;
  	private _impact_listener : Subscription;
	@Input() impacts: DeviceImpact[];
	@Input() geodata: GeoData[];
  	private init: Promise<any>;

  	lastMax = 0;

  	// incoming attribute
  	@Input() showModes = true;
  	@Input() highlightApp: APIAppInfo;
  	@Input() showLegend = true;
  	@Input() showTypesLegend = true;
  	@Input() showXAxis = true;

  	@Input() scale = false;
  	vbox = { width: 700, height: 1024 };

  	_companyHovering: CompanyInfo;
  	_hoveringApp: string;
  	_ignoredApps: string[];

	constructor(private httpM: HttpModule, 
    	private http: Http, 
    	private el: ElementRef,
    	private loader: LoaderService,
    	private focus: FocusService,
    	private hover: HoverService,
    	private zone :NgZone) {
    	
		this.init = Promise.all([
      		this.loader.getCompanyInfo().then((ci) => this.companyid2info = ci),
    	]);
		
		hover.HoverChanged$.subscribe((target) => {
      		if (target !== this._hoveringApp) {
        		this._hoveringApp = target ? target as string : undefined;
        		this.render();
      		}
    	});
		
		this._ignoredApps = [];

    	focus.focusChanged$.subscribe((target) => {
      		if (target !== this._ignoredApps) {
        		this._ignoredApps = target ? target as string[] : [];
        		this.render();
      		}
		});
	}
    
  	getSVGElement() {
    	const nE: HTMLElement = this.el.nativeElement;
    	return Array.from(nE.getElementsByTagName('svg'))[0];
  	}
	
	// this gets called when this.usage_in changes
  	ngOnChanges(changes: SimpleChanges): void {
    	var this_ = this;
		if (this.impactChanges && this._impact_listener === undefined) {
			this._impact_listener = this.impactChanges.subscribe(() => {
				this.zone.run(() => this_.render());
			});
			if (this.impacts) {
				this_.render();
			}
		}
		this.init.then(() => { this.render(); });
  	}

  	ngAfterViewInit(): void { this.init.then(() => this.render()); }

	// combines impacts, geodata, and devices into impacts per device per location
	private compileImpacts(): any {
		var intermediate = [];
		var result = [];
			
		// first pass: aggregate impacts across 
		if (this.impacts) {
			this.impacts.map((i) => {

				if (i.impact === i.impact) {
					if (i.company in intermediate) {
						if (i.device in intermediate[i.company]) {
							intermediate[i.company][i.device] += i.impact;
						} else {
							intermediate[i.company][i.device] = i.impact;
						}
					} else {
						intermediate[i.company] = [];
						intermediate[i.company][i.device] = i.impact;
					}
				}
			});

			for (var company in intermediate) {
				let geo = this.geodata.filter((g) => g.ip === company)[0];
				
				if (typeof(geo) === "undefined") { continue; }
			
				for (var device in intermediate[company]) {
					result.push({
						"ip": company,
						"device": device,
						"impact": intermediate[company][device],
						"country": geo.country_code,
						"lat": geo.latitude,
						"lon": geo.longitude
					});
				}
			}
		}
		return result;
	}
	
	render() {
    	const svgel = this.getSVGElement();
    	if (!svgel || !this.impacts) { return; }

		let rect = svgel.getBoundingClientRect(),
    		width_svgel = Math.round(rect.width - 5),
      		height_svgel = Math.round(rect.height - 5),
      		svg = d3.select(svgel);

    	if (!this.scale) {
    		svg.attr('width', width_svgel)
        		.attr('height', height_svgel);
    	} else {
    		svg.attr('viewBox', `0 0 ${this.vbox.width} ${this.vbox.height}`)
    			.attr('virtualWidth', this.vbox.width)
        		.attr('virtualHeight', this.vbox.height)
        		.attr('preserveAspectRatio', 'none'); //  "xMinYMin meet")
      		width_svgel = this.vbox.width;
      		height_svgel = this.vbox.height;
    	}

    	svg.selectAll('*').remove();

		const countries = _.uniq(this.geodata.map((imp) => imp.country_code));
		const devices = _.uniq(this.impacts.map((imp) => imp.device));
    	const impacts = this.compileImpacts();
		
		let get_impact = (country, device) => {
        	const t = impacts.filter((imp) => imp.country === country && imp.device === device);
        	const reducer = (accumulator, currentValue) => accumulator + currentValue.impact;
	        return t !== undefined ? t.reduce(reducer, 0) : 0;
      	};

		let by_country = countries.map((country) => ({
        	country: country,
        	total: devices.reduce((total, mac) => total += get_impact(country, mac), 0),
        	..._.fromPairs(devices.map((mac) => [mac, get_impact(country, mac)]))
     	 }));

		by_country.sort((c1, c2) => c2.total - c1.total); 

		let margin = { top: 20, right: 20, bottom: this.showXAxis ? 70 : 0, left: 40 },
    		width = width_svgel - margin.left - margin.right, 
			height = height_svgel - margin.top - margin.bottom; 

    	if (width < 50 || height < 50) { return; }

		let g = svg.append('g')
			.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
		
		let x = d3.scaleBand()
        	.rangeRound([0, width]).paddingInner(0.05).align(0.1)
        	.domain(countries);
    
		let d3maxx = d3.max(by_country, function (d) { return d.total; }) || 0,
    		ymaxx = this.lastMax = Math.max(this.lastMax, d3maxx),
    		this_ = this;

    	if (d3maxx < 0.7 * ymaxx) {
    		ymaxx = 1.1 * d3maxx;
    	}
		
		let y = d3.scaleSqrt()
      		.rangeRound([height, 0])
      		.domain([0, ymaxx]).nice();
			
		let z = d3.scaleOrdinal(d3.schemeCategory10).domain(devices);

    	// main rects
		const f = (selection, first, last) => {
      		return selection.selectAll('rect')
        		.data((d) => d)
        		.enter().append('rect')
        		.attr('class', 'bar')
        		.attr('x', (d) => x(d.data.country))
        		.attr('y', (d) => Number.isNaN(y(d[1])) ? 0 : y(d[1]))
        		.attr('height', function (d) { return Number.isNaN(y(d[0]) - y(d[1])) ? 0 : y(d[0]) - y(d[1]); })
        		.attr('width', x.bandwidth())
        		.on('mouseenter', function (d) {
          			if (this.parentElement && this.parentElement.__data__) {
            			this_.hover.hoverChanged(this.parentElement.__data__.key);
          			}
        		})
        		.on('mouseleave', (d) => this_.hover.hoverChanged(undefined));
    	};

    	g.append('g')
      		.selectAll('g')
      		.data(d3.stack().keys(devices)(by_country))
      		.enter().append('g')
      		.attr('fill', (d) => {
        		// highlightApp comes in from @Input() attribute, set using compare
        		// _apphover comes in from hovering service, namely usagetable hover
        		let highApp = this.highlightApp || this._hoveringApp;
        		if (highApp) {
          			return d.key === highApp ? z(d.key) : 'rgba(200,200,200,0.2)';
        		}
        		return z(d.key);
      		})
      		.call(f);

    // x axis
    g.append('g')
      .attr('class', 'axis x')
      .attr('transform', 'translate(0,' + height + ')')
      .call(d3.axisBottom(x))
      .selectAll('text')
      .style('text-anchor', 'end')
      .attr('y', 1)
      .attr('dx', '-.8em')
      .attr('dy', '.15em')
      .attr('transform', 'rotate(-90)');

    if (!this.showXAxis) {
      svg.selectAll('g.axis.x text').text('');
      svg.selectAll('g.axis.x g.tick').remove();
    } else {
      svg.selectAll('g.axis.x g.tick')
        .filter(function (d) { return d; })
        .attr('class', (d) => d.country)
    }

    g.append('g')
      .attr('class', 'axis y')
      .call(d3.axisLeft(y).ticks(null, 's'))
      .append('text')
      .attr('x', 2)
      .attr('y', y(y.ticks().pop()) - 8)
      .attr('dy', '0.32em')
      .text('Impact');

    // legend
    const leading = 26;
    if (this.showLegend) {
      const legend = g.append('g')
        .attr('class', 'legend')
        .attr('transform', 'translate(0,10)')
        .selectAll('g')
        .data(devices.slice().reverse())
        .enter()
        .append('g')
        .attr('transform', function (d, i) { return 'translate(0,' + i * leading + ')'; })
        .on('mouseenter', (d) => this.hover.hoverChanged(undefined))
        .on('mouseout', (d) => this.hover.hoverChanged(undefined))

      legend.append('rect')
        .attr('x', this.showTypesLegend ? width - 140 - 19 : width - 19)
        .attr('width', 19)
        .attr('height', 19)
        .attr('fill', z);

      legend.append('text')
        .attr('x', this.showTypesLegend ? width - 140 - 24 : width - 24)
        .attr('y', 9.5)
        .attr('dy', '0.32em')
        .text((d) => this.loader.getCachedAppInfo(d) && this.loader.getCachedAppInfo(d).storeinfo.title || d);

    	}

	}
	
	@HostListener('window:resize')
	onResize() {
		// call our matchHeight function here
	   	this.render();
	}
	
	@HostListener('mouseenter')
	mouseEnter() {
   		// this.actlog.log('mouseenter', 'geobar');
	}

	@HostListener('mouseleave')
	mouseLv() {
   		// this.actlog.log('mouseleave', 'geobar');
	}  

}
