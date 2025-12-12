import TheMovieDb from '@server/api/themoviedb';
import type {
  TmdbSearchMultiResponse,
  TmdbMovieResult,
  TmdbTvResult,
  TmdbPersonResult,
  TmdbCollectionResult,
} from '@server/api/themoviedb/interfaces';

// Type alias for search results
type TmdbSearchResult =
  | TmdbMovieResult
  | TmdbTvResult
  | TmdbPersonResult
  | TmdbCollectionResult;
import Media from '@server/entity/Media';
import { findSearchProvider } from '@server/lib/search';
import logger from '@server/logger';
import { mapSearchResults } from '@server/models/Search';
import { getUserContentRatingLimits } from '@server/routes/discover';
import { Router } from 'express';

// MPAA movie ratings in order from least to most restrictive
const MOVIE_RATINGS = ['G', 'PG', 'PG-13', 'R', 'NC-17'];

// TV ratings in order from least to most restrictive
const TV_RATINGS = ['TV-Y', 'TV-Y7', 'TV-G', 'TV-PG', 'TV-14', 'TV-MA'];

/**
 * Check if a movie rating exceeds the max allowed
 */
const movieRatingExceedsLimit = (
  rating: string | undefined,
  maxRating: string | undefined
): boolean => {
  if (!maxRating || !rating) return false;
  const ratingIndex = MOVIE_RATINGS.indexOf(rating);
  const maxIndex = MOVIE_RATINGS.indexOf(maxRating);
  if (ratingIndex === -1 || maxIndex === -1) return false;
  return ratingIndex > maxIndex;
};

/**
 * Check if a TV rating exceeds the max allowed
 */
const tvRatingExceedsLimit = (
  rating: string | undefined,
  maxRating: string | undefined
): boolean => {
  if (!maxRating || !rating) return false;
  const ratingIndex = TV_RATINGS.indexOf(rating);
  const maxIndex = TV_RATINGS.indexOf(maxRating);
  if (ratingIndex === -1 || maxIndex === -1) return false;
  return ratingIndex > maxIndex;
};

/**
 * Filter search results based on user's content rating limits
 * Fetches certification for each movie/TV result and filters accordingly
 */
const filterSearchResultsByRating = async (
  results: TmdbSearchResult[],
  tmdb: TheMovieDb,
  maxMovieRating?: string,
  maxTvRating?: string
): Promise<TmdbSearchResult[]> => {
  // If no limits set, return all results
  if (!maxMovieRating && !maxTvRating) {
    return results;
  }

  const filteredResults: TmdbSearchResult[] = [];

  for (const result of results) {
    try {
      if (result.media_type === 'movie' && maxMovieRating) {
        // Get movie details with release dates (includes certification)
        const movieDetails = await tmdb.getMovie({ movieId: result.id });
        const usRelease = movieDetails.release_dates?.results?.find(
          (r) => r.iso_3166_1 === 'US'
        );
        const certification = usRelease?.release_dates?.find(
          (rd) => rd.certification
        )?.certification;

        if (movieRatingExceedsLimit(certification, maxMovieRating)) {
          logger.debug(
            `Filtering movie "${result.title}" (${certification}) - exceeds limit ${maxMovieRating}`,
            { label: 'Search' }
          );
          continue;
        }
      } else if (result.media_type === 'tv' && maxTvRating) {
        // Get TV details with content ratings
        const tvDetails = await tmdb.getTvShow({ tvId: result.id });
        const usRating = tvDetails.content_ratings?.results?.find(
          (r) => r.iso_3166_1 === 'US'
        );

        if (tvRatingExceedsLimit(usRating?.rating, maxTvRating)) {
          logger.debug(
            `Filtering TV "${result.name}" (${usRating?.rating}) - exceeds limit ${maxTvRating}`,
            { label: 'Search' }
          );
          continue;
        }
      }

      filteredResults.push(result);
    } catch (e) {
      // If we can't get certification, include the result (fail open)
      filteredResults.push(result);
    }
  }

  return filteredResults;
};

const searchRoutes = Router();

searchRoutes.get('/', async (req, res, next) => {
  const queryString = req.query.query as string;
  const searchProvider = findSearchProvider(queryString.toLowerCase());
  let results: TmdbSearchMultiResponse;
  const tmdb = new TheMovieDb();

  // Get user's content rating limits for parental controls
  const limits = getUserContentRatingLimits(req.user);

  try {
    if (searchProvider) {
      const [id] = queryString
        .toLowerCase()
        .match(searchProvider.pattern) as RegExpMatchArray;
      results = await searchProvider.search({
        id,
        language: (req.query.language as string) ?? req.locale,
        query: queryString,
      });
    } else {
      results = await tmdb.searchMulti({
        query: queryString,
        page: Number(req.query.page),
        language: (req.query.language as string) ?? req.locale,
      });
    }

    // Apply parental controls filtering
    const filteredResults = await filterSearchResultsByRating(
      results.results,
      tmdb,
      limits.maxMovieRating,
      limits.maxTvRating
    );

    const media = await Media.getRelatedMedia(
      req.user,
      filteredResults.map((result) => result.id)
    );

    return res.status(200).json({
      page: results.page,
      totalPages: results.total_pages,
      totalResults: filteredResults.length,
      results: mapSearchResults(filteredResults, media),
    });
  } catch (e) {
    logger.debug('Something went wrong retrieving search results', {
      label: 'API',
      errorMessage: e.message,
      query: req.query.query,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve search results.',
    });
  }
});

searchRoutes.get('/keyword', async (req, res, next) => {
  const tmdb = new TheMovieDb();

  try {
    const results = await tmdb.searchKeyword({
      query: req.query.query as string,
      page: Number(req.query.page),
    });

    return res.status(200).json(results);
  } catch (e) {
    logger.debug('Something went wrong retrieving keyword search results', {
      label: 'API',
      errorMessage: e.message,
      query: req.query.query,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve keyword search results.',
    });
  }
});

searchRoutes.get('/company', async (req, res, next) => {
  const tmdb = new TheMovieDb();

  try {
    const results = await tmdb.searchCompany({
      query: req.query.query as string,
      page: Number(req.query.page),
    });

    return res.status(200).json(results);
  } catch (e) {
    logger.debug('Something went wrong retrieving company search results', {
      label: 'API',
      errorMessage: e.message,
      query: req.query.query,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve company search results.',
    });
  }
});

export default searchRoutes;
