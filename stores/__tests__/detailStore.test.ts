import useDetailStore, {episodesSelectorBySource} from '../detailStore';
import {api} from '@/services/api';
import {getResolutionFromM3U8} from '@/services/m3u8';
jest.mock('@/services/api',()=>({api:{searchVideo:jest.fn(),searchVideos:jest.fn(),getResources:jest.fn()}}));
jest.mock('@/services/m3u8',()=>({getResolutionFromM3U8:jest.fn()}));
jest.mock('../settingsStore',()=>({useSettingsStore:{getState:()=>({videoSource:{enabledAll:true,sources:{}}})}}));
jest.mock('@/services/storage',()=>({FavoriteManager:{isFavorited:jest.fn().mockResolvedValue(false)}}));
jest.mock('@/utils/Logger',()=>({withTag:()=>({info:jest.fn(),error:jest.fn(),warn:jest.fn()})}));
const film=(id:number,year:string)=>({id,year,title:'三体',source:'a',source_name:'A',episodes:['https://example.invalid/movie.m3u8'],poster:''});
beforeEach(()=>{jest.clearAllMocks();useDetailStore.getState().abort();(getResolutionFromM3U8 as jest.Mock).mockImplementation(()=>new Promise(()=>{}));});
test('details appear even when the media resolution probe never resolves',async()=>{
 (api.searchVideo as jest.Mock).mockResolvedValue({results:[film(1,'2023')]});
 (api.searchVideos as jest.Mock).mockResolvedValue({results:[film(1,'2023')]});
 await useDetailStore.getState().init('三体','a','1','2023');
 expect(useDetailStore.getState().loading).toBe(false);
 expect(useDetailStore.getState().detail?.id).toBe(1);
});
test('selected edition is honored and a different year is not offered as an alternate source',async()=>{
 (api.searchVideo as jest.Mock).mockResolvedValue({results:[film(1,'2023'),film(2,'2024'),film(3,'2024')]});
 (api.searchVideos as jest.Mock).mockResolvedValue({results:[film(1,'2023'),film(2,'2024'),film(3,'2024')]});
 await useDetailStore.getState().init('三体','a','3','2024');
 expect(useDetailStore.getState().detail?.id).toBe(3);
 expect(useDetailStore.getState().searchResults.map(r=>r.year)).toEqual(['2024','2024']);
});

test('playback uses the selected edition even when another edition shares its source',()=>{
 const first={...film(1,'2024'),episodes:['first']};const selected={...film(2,'2024'),episodes:['selected']};
 useDetailStore.setState({detail:selected,searchResults:[first,selected]});
 expect(episodesSelectorBySource('a')(useDetailStore.getState())).toEqual(['selected']);
});
