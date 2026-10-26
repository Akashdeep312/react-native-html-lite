import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  /**
   * Parses an HTML string into a node tree synchronously on the JS thread.
   * The return value matches `HtmlNode[]` from `./parser/types`.
   */
  parse(html: string, maxDepth: number): Object;
}

export default TurboModuleRegistry.get<Spec>('HtmlLite');
